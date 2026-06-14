#!/usr/bin/env python3
"""
04_sync_coach_profiles.py — sync coach profiles from the Coach Form portal.

For every app coach linked to a portal profile (coaches.coachform_id), pulls
the live portal profile (name, credentials, bio, offer, photo) and updates the
app's coach row so portal edits show up WITHOUT reloading a lesson pack.
Profile fields only — never touches programs, lessons, or audio.

Idempotent: re-running with no portal changes writes nothing (photo upload is
an overwrite of the same path).

NO SECRETS IN THIS FILE. Reads from environment (same vars as 03_loader.py):
  SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY            app project
  COACHFORM_SUPABASE_URL / COACHFORM_SERVICE_ROLE_KEY portal project
  COACHFORM_ASSETS_BUCKET                             default: coach-assets
  RELENTLESS_IMAGE_BUCKET                             default: lesson-audio

Usage:
  python 04_sync_coach_profiles.py            # sync all linked coaches
  python 04_sync_coach_profiles.py --dry-run  # show what would change
"""

import argparse
import json
import os
import sys
from urllib.request import Request, urlopen
from urllib.error import HTTPError

URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
CF_URL = os.environ.get("COACHFORM_SUPABASE_URL", "").strip().rstrip("/")
CF_KEY = os.environ.get("COACHFORM_SERVICE_ROLE_KEY", "").strip()
CF_BUCKET = os.environ.get("COACHFORM_ASSETS_BUCKET", "coach-assets")
IMAGE_BUCKET = os.environ.get("RELENTLESS_IMAGE_BUCKET", "lesson-audio")

# Portal column -> app coaches column.
FIELD_MAP = {
    "display_name": "name",
    "credentials": "credentials",
    "bio": "bio",
    "offer_label": "offer_label",
    "offer_url": "external_url",
}


def _headers(key, json_body=False):
    h = {"apikey": key, "Authorization": f"Bearer {key}",
         "User-Agent": "relentless-loader/1.0"}
    if json_body:
        h["Content-Type"] = "application/json"
    return h


def _open(req, timeout=60):
    try:
        return urlopen(req, timeout=timeout)
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"HTTP {e.code} {e.reason} :: {req.get_method()} {req.full_url}\n{detail[:800]}"
        ) from None


def get_json(base, key, path):
    req = Request(f"{base}{path}", headers=_headers(key))
    return json.loads(_open(req).read().decode("utf-8"))


def patch_app(path, body):
    req = Request(f"{URL}{path}", data=json.dumps(body).encode("utf-8"),
                  method="PATCH", headers=_headers(KEY, json_body=True))
    _open(req).read()


def upload_photo(rel_path, data):
    req = Request(f"{URL}/storage/v1/object/{IMAGE_BUCKET}/{rel_path}", data=data,
                  method="POST", headers={**_headers(KEY), "Content-Type": "image/png",
                                          "x-upsert": "true"})
    _open(req, timeout=300).read()


def _trimmed(v):
    return v.strip() if isinstance(v, str) and v.strip() else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="report changes, write nothing")
    args = ap.parse_args()

    missing = [n for n, v in [("SUPABASE_URL", URL), ("SUPABASE_SERVICE_ROLE_KEY", KEY),
                              ("COACHFORM_SUPABASE_URL", CF_URL),
                              ("COACHFORM_SERVICE_ROLE_KEY", CF_KEY)] if not v]
    if missing:
        sys.exit(f"ERROR: set env vars (never hardcode): {', '.join(missing)}")

    portal = {c["id"]: c for c in get_json(CF_URL, CF_KEY, "/rest/v1/coaches?select=*")}
    linked = get_json(
        URL, KEY,
        "/rest/v1/coaches?coachform_id=not.is.null"
        "&select=id,coach_key,name,credentials,bio,offer_label,external_url,avatar_url,coachform_id",
    )
    if not linked:
        print("No app coaches linked to the portal (coaches.coachform_id is empty everywhere).")
        return

    for row in linked:
        cf = portal.get(row["coachform_id"])
        label = f"{row['coach_key']} ({row['id']})"
        if not cf:
            print(f"  !! {label}: portal profile {row['coachform_id']} not found — skipped")
            continue

        patch = {}
        for src, dst in FIELD_MAP.items():
            new = _trimmed(cf.get(src))
            if new is not None and new != row.get(dst):
                patch[dst] = new

        if patch and not args.dry_run:
            patch_app(f"/rest/v1/coaches?id=eq.{row['id']}", patch)

        photo_note = ""
        if cf.get("photo_path"):
            rel = row.get("avatar_url") or f"coach/{row['coach_key']}.png"
            if not args.dry_run:
                req = Request(f"{CF_URL}/storage/v1/object/{CF_BUCKET}/{cf['photo_path']}",
                              headers=_headers(CF_KEY))
                upload_photo(rel, _open(req, timeout=300).read())
                if row.get("avatar_url") != rel:
                    patch_app(f"/rest/v1/coaches?id=eq.{row['id']}", {"avatar_url": rel})
            photo_note = f"  photo -> {rel}"

        changed = ", ".join(f"{k}={v!r}" for k, v in patch.items()) or "no field changes"
        print(f"  {label}: {changed}{photo_note}")

    print("\nDONE." + ("  (dry run — nothing written)" if args.dry_run else ""))


if __name__ == "__main__":
    main()
