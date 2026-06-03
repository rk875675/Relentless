"""
Upload Days 15-30 audio to Supabase Storage using the REST API directly.
Uses urllib (stdlib only) so no extra dependencies needed.
"""

import urllib.request
import os
import sys

# Service-role key is an ADMIN SECRET — provide via env, never hardcode:
#   npx supabase projects api-keys  ->  set SUPABASE_SERVICE_ROLE_KEY before running.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://tnetahaviblrrjixzvbd.supabase.co")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not SERVICE_ROLE_KEY:
    sys.exit("Set SUPABASE_SERVICE_ROLE_KEY in your environment before running (never hardcode it).")
BUCKET = "lesson-audio"
SRC_DIR = r"C:\Users\rkuma\Downloads\RELENTLESS\CONTENT\Grant 015-030"

# (local_filename, storage_path)
UPLOADS = [
    ("lesson_15_seg_01.MP3", "lesson_15/lesson_15_seg_01.mp3"),
    ("lesson_15_seg_02.MP3", "lesson_15/lesson_15_seg_02.mp3"),
    ("lesson_16_seg_01.MP3", "lesson_16/lesson_16_seg_01.mp3"),
    ("lesson_16_seg_02.MP3", "lesson_16/lesson_16_seg_02.mp3"),
    ("lesson_17_seg_01.MP3", "lesson_17/lesson_17_seg_01.mp3"),
    ("lesson_17_seg_02.MP3", "lesson_17/lesson_17_seg_02.mp3"),
    ("lesson_18_seg_01.MP3", "lesson_18/lesson_18_seg_01.mp3"),
    ("lesson_18_seg_02.MP3", "lesson_18/lesson_18_seg_02.mp3"),
    ("lesson_19_seg_01.MP3", "lesson_19/lesson_19_seg_01.mp3"),
    ("lesson_19_seg_02.MP3", "lesson_19/lesson_19_seg_02.mp3"),
    ("lesson_20_seg_01.MP3", "lesson_20/lesson_20_seg_01.mp3"),
    ("lesson_20_seg_02.MP3", "lesson_20/lesson_20_seg_02.mp3"),
    ("lesson_21_seg_01.MP3", "lesson_21/lesson_21_seg_01.mp3"),
    # lesson_21_seg_02 intentionally omitted
    ("lesson_22_seg_01.MP3", "lesson_22/lesson_22_seg_01.mp3"),
    ("lesson_22_seg_02.MP3", "lesson_22/lesson_22_seg_02.mp3"),
    ("lesson_23_seg_01.MP3", "lesson_23/lesson_23_seg_01.mp3"),
    ("lesson_23_seg_02.MP3", "lesson_23/lesson_23_seg_02.mp3"),
    ("lesson_24_seg_01.MP3", "lesson_24/lesson_24_seg_01.mp3"),
    ("lesson_24_seg_02.MP3", "lesson_24/lesson_24_seg_02.mp3"),
    ("lesson_25_seg_01.mp3", "lesson_25/lesson_25_seg_01.mp3"),
    ("lesson_25_seg_02.mp3", "lesson_25/lesson_25_seg_02.mp3"),
    ("lesson_26_seg_01.mp3", "lesson_26/lesson_26_seg_01.mp3"),
    ("lesson_26_seg_02.mp3", "lesson_26/lesson_26_seg_02.mp3"),
    ("lesson_27_seg_01.mp3", "lesson_27/lesson_27_seg_01.mp3"),
    ("lesson_27_seg_02.mp3", "lesson_27/lesson_27_seg_02.mp3"),
    ("lesson_28_seg_01.mp3", "lesson_28/lesson_28_seg_01.mp3"),
    ("lesson_28_seg_02.mp3", "lesson_28/lesson_28_seg_02.mp3"),
    ("lesson_29_seg_01.mp3", "lesson_29/lesson_29_seg_01.mp3"),
    ("lesson_29_seg_02.mp3", "lesson_29/lesson_29_seg_02.mp3"),
    ("lesson_30_seg_01.mp3", "lesson_30/lesson_30_seg_01.mp3"),
    ("lesson_30_seg_02.mp3", "lesson_30/lesson_30_seg_02.mp3"),
]

total = len(UPLOADS)
ok = 0
fail = 0

for i, (local_name, remote_path) in enumerate(UPLOADS, 1):
    local_full = os.path.join(SRC_DIR, local_name)
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{remote_path}"

    with open(local_full, "rb") as f:
        data = f.read()

    req = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
            "Content-Type": "audio/mpeg",
            "x-upsert": "true",   # overwrite if exists
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            status = resp.status
            print(f"[{i}/{total}] OK ({status}) {remote_path}")
            ok += 1
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")
        print(f"[{i}/{total}] FAIL ({e.code}) {remote_path}: {body[:120]}", file=sys.stderr)
        fail += 1
    except Exception as e:
        print(f"[{i}/{total}] ERROR {remote_path}: {e}", file=sys.stderr)
        fail += 1

print(f"\nDone. {ok} uploaded, {fail} failed.")
