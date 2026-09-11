#!/usr/bin/env python3
"""
05_import_referral_codes.py — load one App Store Connect offer-code CSV into
the referral code pool (PRD 10.5, Phase 4a).

Reads ONE downloaded "one-time use codes" CSV and POSTs its codes to the
referral-admin edge function, which inserts them into referral_offer_codes.
Zero user-facing surface: this is operator tooling, run locally.

Handles both shapes App Store Connect produces:
  1 column  — code only                      (sandbox exports)
  2 columns — code, redeem URL               (production exports)
The redeem URL column is discarded and never transmitted. Apple redeem URLs
are deliberately not distributed (PRD 10.5.4): redemption outside the app
destroys attribution.

Nothing about the import is inferred from the file or its name. --environment,
--product-id, --offer-reference-name and --apple-expires-at are all required
from the operator, because production and sandbox codes are byte-identical in
format and a sandbox code handed to a real customer burns their invite.

Idempotent: the server inserts with ON CONFLICT DO NOTHING on lower(code), so
re-running the same CSV writes nothing and reports every code as already
present. Safe to re-run after an interrupted load.

Code values are never printed, logged, or written to disk by this script — the
production batches are real money. Output is counts only.

NO SECRETS IN THIS FILE. Reads from environment:
  SUPABASE_URL            e.g. https://<ref>.supabase.co  (functions URL derived)
  PROMO_ADMIN_PASSWORD    the admin password the referral-admin function checks
Optional:
  SUPABASE_FUNCTIONS_URL  override the derived https://<ref>.functions.supabase.co

Usage (dry run first — reports what WOULD be inserted, writes nothing):
  python 05_import_referral_codes.py path/to/codes.csv \
      --environment sandbox \
      --product-id com.relentless.monthly.b \
      --offer-reference-name TEAMMATE20_MONTHLY_B \
      --apple-expires-at 2027-03-11 \
      --dry-run

  # then the real load (production also requires typing the word to confirm)
  python 05_import_referral_codes.py path/to/codes.csv ... (same flags)

  # verify the pool afterwards, no import
  python 05_import_referral_codes.py --stock

Live SKUs, for reference:
  com.relentless.monthly.b   $7.99/mo   (current)
  com.relentless.annual.b    $59.99/yr  (current)
  com.relentless.monthly     $4.99/mo   (legacy — never sold to a new subscriber)
  com.relentless.annual      $39.99/yr  (legacy — never sold to a new subscriber)
"""

import argparse
import csv
import json
import os
import re
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# Auto-load .env from the repo root so the script works without manually
# exporting every variable (the file is gitignored and never committed).
_env_path = os.path.join(os.path.dirname(__file__), "..", ".env")
if os.path.isfile(_env_path):
    with open(_env_path) as _ef:
        for _line in _ef:
            _line = _line.strip()
            if _line and not _line.startswith("#") and "=" in _line:
                _k, _, _v = _line.partition("=")
                _k = _k.strip()
                _v = _v.strip().strip('"').strip("'")
                if _k:
                    os.environ[_k] = _v

URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
FUNCTIONS_URL = os.environ.get("SUPABASE_FUNCTIONS_URL", "").strip().rstrip("/")
ADMIN_PASSWORD = os.environ.get("PROMO_ADMIN_PASSWORD", "").strip()

# Server accepts 6-24 alphanumeric; every batch Apple has issued so far is 18.
CODE_RE = re.compile(r"^[A-Za-z0-9]{6,24}$")
EXPECTED_CODE_LEN = 18
CHUNK_SIZE = 500


def functions_base():
    if FUNCTIONS_URL:
        return FUNCTIONS_URL
    if not URL:
        sys.exit("ERROR: set SUPABASE_URL (or SUPABASE_FUNCTIONS_URL) in your environment")
    return f"{URL}/functions/v1"


def api(path, body):
    req = Request(
        f"{functions_base()}/referral-admin/{path}",
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-admin-password": ADMIN_PASSWORD,
            "User-Agent": "relentless-referral-importer/1.0",
        },
    )
    try:
        raw = urlopen(req, timeout=120).read().decode("utf-8")
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        # The request body holds live codes, so only the response is shown.
        raise RuntimeError(f"HTTP {e.code} {e.reason} :: {path}\n{detail[:800]}") from None
    return json.loads(raw).get("data", {})


def read_codes(path):
    """Return (codes, report). Code VALUES never leave this function's caller
    chain except inside the POST body — nothing here prints or stores them."""
    with open(path, newline="", encoding="utf-8-sig") as fh:
        rows = [r for r in csv.reader(fh) if any((c or "").strip() for c in r)]

    if not rows:
        sys.exit(f"ERROR: {path} has no data rows")

    widths = {len(r) for r in rows}
    if max(widths) > 2:
        sys.exit(
            f"ERROR: {path} has {max(widths)} columns; expected 1 (code) or "
            f"2 (code, redeem URL). Wrong file?"
        )

    codes = []
    non_code_rows = []
    for i, row in enumerate(rows, start=1):
        first = (row[0] or "").strip()
        if CODE_RE.match(first):
            codes.append(first.upper())
        else:
            non_code_rows.append(i)

    # One leading non-code row is the header App Store Connect sometimes emits.
    # More than that means this is not a code export.
    if non_code_rows not in ([], [1]):
        sys.exit(
            f"ERROR: {path} has {len(non_code_rows)} row(s) that are not offer "
            f"codes (rows {non_code_rows[:5]}). Wrong file or wrong format."
        )

    if not codes:
        sys.exit(f"ERROR: {path} contained no offer codes")

    unique = sorted(set(codes))
    lengths = sorted({len(c) for c in unique})

    return unique, {
        "rows": len(rows),
        "columns": max(widths),
        "header_skipped": len(non_code_rows) == 1,
        "codes_found": len(codes),
        "unique_codes": len(unique),
        "duplicates_in_file": len(codes) - len(unique),
        "code_lengths": lengths,
    }


def normalize_expiry(value):
    """Accept YYYY-MM-DD or a full ISO timestamp; return ISO 8601 with offset.
    A bare date becomes midnight UTC, which is the conservative reading: we
    must stop handing out a code BEFORE Apple's expiry, never after."""
    v = value.strip()
    if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        return f"{v}T00:00:00+00:00"
    if v.endswith("Z"):
        return v[:-1] + "+00:00"
    if re.search(r"[+-]\d{2}:\d{2}$", v):
        return v
    sys.exit(
        "ERROR: --apple-expires-at must be YYYY-MM-DD or a full ISO timestamp "
        "with a UTC offset"
    )


def print_stock():
    stock = api("codes/stock", {}).get("stock", [])
    if not stock:
        print("Code pool is empty.")
        return
    print(f"\n{'env':<11} {'product_id':<26} {'offer':<22} {'status':<10} {'count':>6}  earliest expiry")
    for row in stock:
        print(
            f"{row['environment']:<11} {row['product_id']:<26} "
            f"{row['offer_reference_name']:<22} {row['status']:<10} "
            f"{row['code_count']:>6}  {(row.get('earliest_expiry') or '')[:10]}"
        )


def main():
    ap = argparse.ArgumentParser(
        description="Import one App Store Connect offer-code CSV into the referral pool."
    )
    ap.add_argument("csv_path", nargs="?", help="path to the downloaded one-time-use codes CSV")
    ap.add_argument("--environment", choices=["production", "sandbox"],
                    help="Apple environment these codes are valid in (required for import)")
    ap.add_argument("--product-id", help="SKU the code subscribes the invitee to (required)")
    ap.add_argument("--offer-reference-name",
                    help="App Store Connect offer Reference Name, e.g. TEAMMATE20_MONTHLY_B (required)")
    ap.add_argument("--apple-expires-at",
                    help="batch expiry from App Store Connect, YYYY-MM-DD (required)")
    ap.add_argument("--imported-batch",
                    help="reconciliation label (default: the CSV filename)")
    ap.add_argument("--dry-run", action="store_true",
                    help="report what would be inserted; writes nothing")
    ap.add_argument("--yes", action="store_true",
                    help="skip the interactive confirmation for a production import")
    ap.add_argument("--stock", action="store_true",
                    help="print aggregated pool counts and exit")
    args = ap.parse_args()

    if not ADMIN_PASSWORD:
        sys.exit("ERROR: set PROMO_ADMIN_PASSWORD in your environment (never hardcode it)")


    if args.stock:
        print_stock()
        return

    required = [
        ("csv_path", args.csv_path),
        ("--environment", args.environment),
        ("--product-id", args.product_id),
        ("--offer-reference-name", args.offer_reference_name),
        ("--apple-expires-at", args.apple_expires_at),
    ]
    missing = [name for name, val in required if not val]
    if missing:
        sys.exit(f"ERROR: missing required argument(s): {', '.join(missing)}")

    if not os.path.isfile(args.csv_path):
        sys.exit(f"ERROR: no such file: {args.csv_path}")

    expires_at = normalize_expiry(args.apple_expires_at)
    batch = (args.imported_batch or os.path.basename(args.csv_path)).strip()

    codes, report = read_codes(args.csv_path)

    print(f"File:      {os.path.basename(args.csv_path)}")
    print(f"Shape:     {report['rows']} rows / {report['columns']} column(s)"
          + ("  (header row skipped)" if report["header_skipped"] else "")
          + ("  (redeem URL column discarded)" if report["columns"] == 2 else ""))
    print(f"Codes:     {report['unique_codes']} unique"
          + (f"  ({report['duplicates_in_file']} duplicate(s) in file collapsed)"
             if report["duplicates_in_file"] else ""))
    print(f"Length:    {report['code_lengths']}"
          + ("" if report["code_lengths"] == [EXPECTED_CODE_LEN]
             else f"  !! expected all {EXPECTED_CODE_LEN}"))
    print(f"Target:    {args.environment} / {args.product_id} / {args.offer_reference_name}")
    print(f"Expires:   {expires_at}")
    print(f"Batch:     {batch}")

    if args.environment == "production" and not args.dry_run and not args.yes:
        print(
            f"\nThis writes {report['unique_codes']} REAL App Store discount codes "
            f"to the production pool."
        )
        if input('Type "production" to continue: ').strip() != "production":
            sys.exit("Aborted — nothing written.")

    totals = {"requested": 0, "unique_codes": 0, "inserted": 0,
              "already_present": 0, "mismatched_existing": 0}
    warnings = []

    print()
    for start in range(0, len(codes), CHUNK_SIZE):
        chunk = codes[start:start + CHUNK_SIZE]
        result = api("codes/import", {
            "environment": args.environment,
            "product_id": args.product_id,
            "offer_reference_name": args.offer_reference_name,
            "apple_expires_at": expires_at,
            "imported_batch": batch,
            "codes": chunk,
            "dry_run": args.dry_run,
        })
        for k in totals:
            totals[k] += int(result.get(k) or 0)
        warnings.extend(result.get("warnings") or [])
        print(f"  chunk {start // CHUNK_SIZE + 1}: {len(chunk)} sent, "
              f"{result.get('inserted', 0)} inserted, "
              f"{result.get('already_present', 0)} already present")

    print(f"\nTotals: {totals['unique_codes']} unique sent, "
          f"{totals['inserted']} inserted, "
          f"{totals['already_present']} already present, "
          f"{totals['mismatched_existing']} mismatched existing")

    for w in sorted(set(warnings)):
        print(f"  !! {w}")

    print("DONE." + ("  (dry run — nothing written)" if args.dry_run else ""))

    if not args.dry_run:
        print_stock()


if __name__ == "__main__":
    main()
