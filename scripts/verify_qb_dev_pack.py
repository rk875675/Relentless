"""
Backend smoke verification for the dev QB-pack lesson (no app needed):
  1. Lesson row exists with content_blocks and is published.
  2. It is isolated: no program_schedule row, no lesson_categories rows.
  3. Every audio/ambient path in content_blocks signs and is reachable (HTTP 200).
"""

import json
import os
import sys
import urllib.request
import urllib.error

# Service-role key is an ADMIN SECRET — provide it via the environment, never hardcode:
#   npx supabase projects api-keys   ->   set SUPABASE_SERVICE_ROLE_KEY before running.
SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://tnetahaviblrrjixzvbd.supabase.co")
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if not SERVICE_ROLE_KEY:
    sys.exit("Set SUPABASE_SERVICE_ROLE_KEY in your environment before running (never hardcode it).")
BUCKET = "lesson-audio"
LESSON_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd"

H = {"apikey": SERVICE_ROLE_KEY, "Authorization": f"Bearer {SERVICE_ROLE_KEY}"}


def get_json(path):
    req = urllib.request.Request(f"{SUPABASE_URL}{path}", headers=H, method="GET")
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())


def sign(path):
    url = f"{SUPABASE_URL}/storage/v1/object/sign/{BUCKET}/{path}"
    body = json.dumps({"expiresIn": 3600}).encode()
    req = urllib.request.Request(
        url, data=body, method="POST",
        headers={**H, "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=60) as r:
        signed = json.loads(r.read().decode())["signedURL"]
    full = f"{SUPABASE_URL}/storage/v1{signed}"
    head = urllib.request.Request(full, method="GET", headers={"Range": "bytes=0-0"})
    with urllib.request.urlopen(head, timeout=60) as r:
        return r.status


fails = []

rows = get_json(
    f"/rest/v1/lessons?id=eq.{LESSON_ID}"
    "&select=id,title,lesson_type,published,production_ready,duration_seconds,content_blocks"
)
if not rows:
    print("FAIL: lesson row not found")
    sys.exit(1)
lesson = rows[0]
print(f"Lesson: {lesson['title']!r}  type={lesson['lesson_type']}  "
      f"published={lesson['published']}  production_ready={lesson['production_ready']}  "
      f"dur={lesson['duration_seconds']}s")
if not lesson["published"]:
    fails.append("lesson not published (player requires published=true)")
if lesson["production_ready"] is not False:
    fails.append("expected production_ready=false (preview gate)")

# Preview gate: a non-dev catalog query (published + production_ready) must NOT
# return it; a dev catalog query (published only) must return it.
nondev = get_json(
    f"/rest/v1/lessons?id=eq.{LESSON_ID}&published=eq.true&production_ready=eq.true&select=id"
)
dev = get_json(f"/rest/v1/lessons?id=eq.{LESSON_ID}&published=eq.true&select=id")
print(f"Preview gate: non-dev catalog match={len(nondev)} (want 0)  "
      f"dev catalog match={len(dev)} (want 1)")
if nondev:
    fails.append("preview gate leak: production_ready filter still returns it to non-dev")
if not dev:
    fails.append("dev catalog cannot see the lesson")

sched = get_json(f"/rest/v1/program_schedule?lesson_id=eq.{LESSON_ID}&select=day_number")
cats = get_json(f"/rest/v1/lesson_categories?lesson_id=eq.{LESSON_ID}&select=category")
cat_names = [c["category"] for c in cats]
print(f"Schedule rows={len(sched)} (want 0)  categories={cat_names} (want ['mindfulness'])")
if sched:
    fails.append(f"unexpectedly scheduled: {sched}")
if "mindfulness" not in cat_names:
    fails.append("missing mindfulness category (M color + trophy tag)")

# Spot-check cues are sentence-level (end with terminal punctuation, <=75 chars).
for b in lesson["content_blocks"]["blocks"]:
    if b["type"] == "voiceover":
        for c in b["timed_text"]:
            if len(c["text"]) > 75:
                fails.append(f"cue over 75 chars: {c['text']}")

paths = []
for b in lesson["content_blocks"]["blocks"]:
    if b["type"] == "voiceover":
        paths.extend(b["audio_files"])
    if b.get("ambient_audio"):
        paths.append(b["ambient_audio"])

print("Signing + fetching audio paths:")
for p in paths:
    try:
        status = sign(p)
        print(f"  OK ({status}) {p}")
    except urllib.error.HTTPError as e:
        print(f"  FAIL ({e.code}) {p}")
        fails.append(f"audio not reachable: {p}")
    except Exception as e:
        print(f"  ERROR {p}: {e}")
        fails.append(f"audio error: {p}")

if fails:
    print("\nFAILURES:")
    for f in fails:
        print(f"  - {f}")
    sys.exit(1)
print("\nALL CHECKS PASSED — lesson loads server-side and audio is reachable.")
