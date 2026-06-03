"""
Upload the dev QB-pack voiceover audio to Supabase Storage (bucket lesson-audio)
at the bucket-relative paths referenced by the generated content_blocks.

Stdlib-only (urllib). The service-role key is an ADMIN SECRET and must NEVER be
hardcoded or shared. Provide it via the environment before running:

    npx supabase projects api-keys        # copy the service_role value
    setx SUPABASE_SERVICE_ROLE_KEY "..."  # (Windows; new shell) or set it inline
    python scripts/upload_qb_dev_pack.py
"""

import os
import sys
import urllib.request
import urllib.error

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://tnetahaviblrrjixzvbd.supabase.co")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not SERVICE_ROLE_KEY:
    sys.exit("Set SUPABASE_SERVICE_ROLE_KEY in your environment before running (never hardcode it).")
BUCKET = "lesson-audio"
PACK_DIR = os.path.join(os.path.dirname(__file__), "_dev_pack")

# (local relative path within the pack, storage path == content_blocks audio path)
UPLOADS = [
    ("grant-chiasson/qb-program/lesson_01/seg_01.mp3",
     "grant-chiasson/qb-program/lesson_01/seg_01.mp3"),
    ("grant-chiasson/qb-program/lesson_01/seg_02.mp3",
     "grant-chiasson/qb-program/lesson_01/seg_02.mp3"),
]

ok = fail = 0
for i, (local_rel, remote_path) in enumerate(UPLOADS, 1):
    local_full = os.path.join(PACK_DIR, *local_rel.split("/"))
    if not os.path.exists(local_full):
        print(f"[{i}] MISSING local file: {local_full}", file=sys.stderr)
        fail += 1
        continue
    with open(local_full, "rb") as f:
        data = f.read()
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{remote_path}"
    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "audio/mpeg",
            "x-upsert": "true",
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            print(f"[{i}] OK ({resp.status}) {remote_path}")
            ok += 1
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[{i}] FAIL ({e.code}) {remote_path}: {body[:160]}", file=sys.stderr)
        fail += 1
    except Exception as e:
        print(f"[{i}] ERROR {remote_path}: {e}", file=sys.stderr)
        fail += 1

print(f"\nDone. {ok} uploaded, {fail} failed.")
sys.exit(1 if fail else 0)
