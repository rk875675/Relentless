#!/usr/bin/env python3
"""
Invoke replay-superwall-notifications.

Fetches Apple ASSN v2 history and optionally POSTs the original signed
payloads to Superwall. Secrets are read from the environment / .env and
never printed.

Required (one of):
  SUPABASE_SERVICE_ROLE_KEY
  TRIAL_REMINDER_CRON_SECRET

Optional:
  SUPABASE_PROJECT_REF   default tnetahaviblrrjixzvbd
  APPLY                  set to 1 to replay (default is dry-run)
"""

import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
PROJECT_REF_DEFAULT = "tnetahaviblrrjixzvbd"


def _load_dotenv(path: Path) -> None:
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return
    for line in raw.splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


for _candidate in (REPO_ROOT / ".env", REPO_ROOT / "mobile" / ".env"):
    _load_dotenv(_candidate)

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", PROJECT_REF_DEFAULT).strip()
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
CRON_SECRET = os.environ.get("TRIAL_REMINDER_CRON_SECRET", "").strip()
ANON_KEY = (
    os.environ.get("EXPO_PUBLIC_SUPABASE_ANON_KEY", "").strip()
    or os.environ.get("SUPABASE_ANON_KEY", "").strip()
    or os.environ.get("EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "").strip()
)
APPLY = os.environ.get("APPLY", "").strip() == "1"


def _present(name: str) -> bool:
    return bool(os.environ.get(name, "").strip())


def main() -> int:
    if not CRON_SECRET and not SERVICE_ROLE_KEY:
        print(
            "Set TRIAL_REMINDER_CRON_SECRET or SUPABASE_SERVICE_ROLE_KEY "
            "in the environment (never hardcode it).",
            file=sys.stderr,
        )
        print(
            "env_present "
            f"TRIAL_REMINDER_CRON_SECRET={_present('TRIAL_REMINDER_CRON_SECRET')} "
            f"SUPABASE_SERVICE_ROLE_KEY={_present('SUPABASE_SERVICE_ROLE_KEY')} "
            f"EXPO_PUBLIC_SUPABASE_ANON_KEY={_present('EXPO_PUBLIC_SUPABASE_ANON_KEY')}",
            file=sys.stderr,
        )
        return 1

    gateway_key = ANON_KEY or SERVICE_ROLE_KEY
    if not gateway_key:
        print(
            "Set EXPO_PUBLIC_SUPABASE_ANON_KEY in the environment for the functions gateway.",
            file=sys.stderr,
        )
        return 1

    url = f"https://{PROJECT_REF}.supabase.co/functions/v1/replay-superwall-notifications"
    payload = {"dryRun": True}
    if APPLY:
        payload = {"dryRun": False, "confirm": "REPLAY_PRODUCTION"}

    headers = {
        "Content-Type": "application/json",
        "apikey": ANON_KEY or gateway_key,
        "Authorization": f"Bearer {ANON_KEY or gateway_key}",
    }
    if CRON_SECRET:
        headers["x-cron-secret"] = CRON_SECRET
    elif SERVICE_ROLE_KEY:
        headers["Authorization"] = f"Bearer {SERVICE_ROLE_KEY}"
        headers["apikey"] = SERVICE_ROLE_KEY

    req = Request(url, data=json.dumps(payload).encode("utf-8"), headers=headers, method="POST")
    try:
        with urlopen(req, timeout=300) as resp:
            body = json.loads(resp.read().decode("utf-8"))
    except HTTPError as err:
        detail = err.read().decode("utf-8", errors="replace")[:400]
        print(f"HTTP {err.code}", file=sys.stderr)
        print(detail, file=sys.stderr)
        return 1

    data = body.get("data", body)
    print(json.dumps(data, indent=2, sort_keys=True))
    if data.get("apple_http_error"):
        return 2
    if not data.get("dry_run") and data.get("superwall_failed", 0) > 0:
        return 3
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
