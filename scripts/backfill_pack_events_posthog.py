#!/usr/bin/env python3
"""
backfill_pack_events_posthog.py — Backfill pack_rated, pack_completed, pack_activated.

Sources of truth are Supabase rows that already exist:

  pack_rated      program_ratings (one event per rating row)
  pack_completed  first completion of each pack's final published lesson
  pack_activated  first time a user actually started a pack:
                    - non-sprint: user_program_state.started = true
                    - Grant 30-day sprint: first sprint lesson completion
                      (sprint state rows were mass-backfilled for every profile,
                      so they are not a real activation signal)

$insert_id makes same-day re-runs safe. After ~24h PostHog may accept duplicates,
so skip rows that already exist when POSTHOG_PERSONAL_API_KEY is set.

NO SECRETS IN THIS FILE. All secrets are read from the environment.

Required:
  SUPABASE_SERVICE_ROLE_KEY
  POSTHOG_API_KEY  (or EXPO_PUBLIC_POSTHOG_API_KEY)

Optional:
  SUPABASE_URL                 default https://<SUPABASE_PROJECT_REF>.supabase.co
  SUPABASE_PROJECT_REF         default tnetahaviblrrjixzvbd
  POSTHOG_HOST                 default https://us.i.posthog.com
  POSTHOG_PERSONAL_API_KEY     used to skip already-ingested events
  POSTHOG_PROJECT_ID           default 400227
  DRY_RUN                      set to '1' to print counts without sending
"""

import json
import os
import sys
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

REPO_ROOT = Path(__file__).resolve().parents[1]
SPRINT_PROGRAM_ID = "b0000000-0000-0000-0000-000000000001"
PROGRAM_VERSION = "v1"
BATCH_SIZE = 100
PAGE = 1000


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

PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "tnetahaviblrrjixzvbd").strip()
# Prefer the linked Relentless project. A dotenv SUPABASE_URL can point at the
# coach portal and 401 against this repo's service-role key.
_default_url = f"https://{PROJECT_REF}.supabase.co" if PROJECT_REF else ""
_env_url = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
if _env_url and PROJECT_REF and PROJECT_REF not in _env_url:
    SUPABASE_URL = _default_url
else:
    SUPABASE_URL = _env_url or _default_url
SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
POSTHOG_API_KEY = (
    os.environ.get("POSTHOG_API_KEY", "").strip()
    or os.environ.get("EXPO_PUBLIC_POSTHOG_API_KEY", "").strip()
)
POSTHOG_HOST = os.environ.get("POSTHOG_HOST", "https://us.i.posthog.com").strip().rstrip("/")
POSTHOG_PERSONAL_API_KEY = os.environ.get("POSTHOG_PERSONAL_API_KEY", "").strip()
POSTHOG_PROJECT_ID = os.environ.get("POSTHOG_PROJECT_ID", "400227").strip()
POSTHOG_APP_HOST = os.environ.get("POSTHOG_APP_HOST", "https://us.posthog.com").strip().rstrip("/")
DRY_RUN = os.environ.get("DRY_RUN", "0").strip() == "1"


def sb_headers() -> dict:
    return {
        "apikey": SERVICE_ROLE_KEY,
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "count=exact",
    }


def sb_get(path: str) -> list:
    rows = []
    offset = 0
    while True:
        sep = "&" if "?" in path else "?"
        url = f"{SUPABASE_URL}/rest/v1/{path}{sep}limit={PAGE}&offset={offset}"
        req = Request(url, headers=sb_headers())
        try:
            resp = urlopen(req, timeout=60)
            chunk = json.loads(resp.read().decode())
        except HTTPError as e:
            sys.exit(f"Supabase error {e.code} on {path.split('?')[0]}")
        if not isinstance(chunk, list):
            sys.exit(f"Unexpected Supabase payload for {path.split('?')[0]}")
        rows.extend(chunk)
        if len(chunk) < PAGE:
            break
        offset += PAGE
    return rows


def fetch_programs() -> dict:
    rows = sb_get("programs?select=id,program_key,title,coach_id")
    return {r["id"]: r for r in rows}


def fetch_coaches() -> dict:
    rows = sb_get("coaches?select=id,coach_key,name")
    return {r["id"]: r for r in rows}


def fetch_ratings() -> list:
    return sb_get(
        "program_ratings?select=id,user_id,program_id,program_name,rating,created_at"
        "&order=created_at.asc"
    )


def fetch_final_lessons() -> dict:
    """program_id -> {lesson_id, total_days} for the last published lesson."""
    finals = {}
    sched = sb_get(
        f"program_schedule?select=day_number,lesson_id"
        f"&program_version=eq.{quote(PROGRAM_VERSION)}"
        f"&order=day_number.desc"
    )
    if sched:
        top = sched[0]
        finals[SPRINT_PROGRAM_ID] = {
            "lesson_id": top["lesson_id"],
            "total_days": top["day_number"],
        }

    lessons = sb_get(
        "lessons?select=id,program_id,sequence"
        "&published=eq.true"
        "&program_id=not.is.null"
        "&order=sequence.desc"
    )
    for row in lessons:
        pid = row.get("program_id")
        if not pid or pid in finals:
            continue
        finals[pid] = {"lesson_id": row["id"], "total_days": row.get("sequence")}
    return finals


def fetch_completions_for(lesson_ids: list[str]) -> list:
    if not lesson_ids:
        return []
    # PostgREST `in` filter — ids are UUIDs, safe to interpolate.
    joined = ",".join(lesson_ids)
    return sb_get(
        "user_lesson_completions"
        f"?select=user_id,lesson_id,completed_at"
        f"&lesson_id=in.({joined})"
        f"&order=completed_at.asc"
    )


def fetch_started_states() -> list:
    return sb_get(
        "user_program_state"
        "?select=user_id,program_id,started,started_local_date,updated_at"
        "&started=eq.true"
    )


def fetch_sprint_first_completions() -> list:
    sprint_lessons = sb_get(
        "lessons?select=id"
        f"&program_id=eq.{SPRINT_PROGRAM_ID}"
        "&published=eq.true"
    )
    lesson_ids = [r["id"] for r in sprint_lessons]
    if not lesson_ids:
        return []
    joined = ",".join(lesson_ids)
    rows = sb_get(
        "user_lesson_completions"
        f"?select=user_id,completed_at"
        f"&lesson_id=in.({joined})"
        f"&order=completed_at.asc"
    )
    first = {}
    for row in rows:
        uid = row["user_id"]
        if uid not in first:
            first[uid] = row["completed_at"]
    return [{"user_id": uid, "completed_at": ts} for uid, ts in first.items()]


def hogql(query: str) -> list:
    if not POSTHOG_PERSONAL_API_KEY:
        return []
    body = json.dumps({
        "query": {"kind": "HogQLQuery", "query": query},
        "name": "pack-event-backfill-existing",
    }).encode()
    req = Request(
        f"{POSTHOG_APP_HOST}/api/projects/{POSTHOG_PROJECT_ID}/query/",
        data=body,
        method="POST",
        headers={
            "Authorization": f"Bearer {POSTHOG_PERSONAL_API_KEY}",
            "Content-Type": "application/json",
        },
    )
    try:
        resp = urlopen(req, timeout=60)
        payload = json.loads(resp.read().decode())
    except HTTPError:
        print("  warning: could not read existing PostHog events; sending all")
        return []
    return payload.get("results") or []


def existing_pairs(event: str) -> set[tuple[str, str]]:
    rows = hogql(
        "SELECT distinct_id, toString(properties.program_id)\n"
        f"FROM events\n"
        f"WHERE event = '{event}'\n"
        "  AND timestamp >= toDateTime('2026-01-01 00:00:00')\n"
        "  AND properties.program_id IS NOT NULL"
    )
    out = set()
    for row in rows:
        if isinstance(row, (list, tuple)) and len(row) >= 2 and row[0] and row[1]:
            out.add((str(row[0]), str(row[1])))
    return out


def send_batch(events: list) -> bool:
    if DRY_RUN:
        return True
    body = json.dumps({
        "api_key": POSTHOG_API_KEY,
        "historical_migration": True,
        "batch": events,
    }).encode()
    req = Request(
        f"{POSTHOG_HOST}/batch/",
        data=body,
        method="POST",
        headers={"Content-Type": "application/json"},
    )
    try:
        resp = urlopen(req, timeout=30)
        return resp.status == 200
    except HTTPError as e:
        print(f"  PostHog HTTP {e.code}")
        return False


def pack_meta(program_id, programs, coaches):
    prog = programs.get(program_id) if program_id else None
    coach = coaches.get(prog["coach_id"]) if prog and prog.get("coach_id") else None
    return {
        "program_key": prog["program_key"] if prog else None,
        "program_title": (prog["title"] if prog else None),
        "coach_key": coach["coach_key"] if coach else None,
        "coach_name": coach["name"] if coach else None,
    }


def main():
    if not SUPABASE_URL or not SERVICE_ROLE_KEY:
        sys.exit(
            "ERROR: Set SUPABASE_URL (or SUPABASE_PROJECT_REF) and "
            "SUPABASE_SERVICE_ROLE_KEY (never hardcode them)."
        )
    if not POSTHOG_API_KEY and not DRY_RUN:
        sys.exit("ERROR: Set POSTHOG_API_KEY or EXPO_PUBLIC_POSTHOG_API_KEY.")

    print(f"{'[DRY RUN] ' if DRY_RUN else ''}Loading pack rows from Supabase…")
    programs = fetch_programs()
    coaches = fetch_coaches()
    ratings = fetch_ratings()
    finals = fetch_final_lessons()
    completions = fetch_completions_for([v["lesson_id"] for v in finals.values()])
    states = fetch_started_states()
    sprint_first = fetch_sprint_first_completions()
    print(
        f"  programs={len(programs)} ratings={len(ratings)} "
        f"final_lessons={len(finals)} final_completions={len(completions)} "
        f"started_states={len(states)} sprint_first_completions={len(sprint_first)}"
    )

    print("Checking existing PostHog pack events (skip already-ingested)…")
    have_rated = existing_pairs("pack_rated")
    have_completed = existing_pairs("pack_completed")
    have_activated = existing_pairs("pack_activated")
    print(
        f"  already in PostHog: rated={len(have_rated)} "
        f"completed={len(have_completed)} activated={len(have_activated)}"
    )

    lesson_to_program = {v["lesson_id"]: pid for pid, v in finals.items()}
    first_final = {}
    for row in completions:
        key = (row["user_id"], lesson_to_program.get(row["lesson_id"]))
        if key[1] and key not in first_final:
            first_final[key] = row["completed_at"]

    events = []

    for r in ratings:
        uid = r["user_id"]
        program_id = r.get("program_id")
        if program_id and (uid, program_id) in have_rated:
            continue
        meta = pack_meta(program_id, programs, coaches)
        title = meta["program_title"] or (r.get("program_name") or "").strip() or None
        events.append({
            "event": "pack_rated",
            "distinct_id": uid,
            "timestamp": r["created_at"],
            "properties": {
                "$insert_id": f"backfill-rated-{r['id']}",
                "$lib": "backfill-script",
                "rating": r["rating"],
                "program_id": program_id,
                "program_key": meta["program_key"],
                "program_name": title,
                "source": "backfill",
            },
        })

    for (uid, program_id), ts in first_final.items():
        if (uid, program_id) in have_completed:
            continue
        meta = pack_meta(program_id, programs, coaches)
        events.append({
            "event": "pack_completed",
            "distinct_id": uid,
            "timestamp": ts,
            "properties": {
                "$insert_id": f"backfill-completed-{uid}-{program_id}",
                "$lib": "backfill-script",
                "program_id": program_id,
                "program_key": meta["program_key"],
                "program_title": meta["program_title"],
                "coach_key": meta["coach_key"],
                "coach_name": meta["coach_name"],
                "total_days": finals.get(program_id, {}).get("total_days"),
                "source": "backfill",
            },
        })

    activated_keys = set()
    for row in states:
        uid = row["user_id"]
        program_id = row["program_id"]
        if program_id == SPRINT_PROGRAM_ID:
            continue
        if not row.get("started"):
            continue
        if (uid, program_id) in have_activated:
            continue
        activated_keys.add((uid, program_id))
        meta = pack_meta(program_id, programs, coaches)
        ts = row.get("started_local_date") or row.get("updated_at")
        if ts and len(str(ts)) == 10:
            ts = f"{ts}T12:00:00Z"
        events.append({
            "event": "pack_activated",
            "distinct_id": uid,
            "timestamp": ts,
            "properties": {
                "$insert_id": f"backfill-activated-{uid}-{program_id}",
                "$lib": "backfill-script",
                "program_id": program_id,
                "program_key": meta["program_key"],
                "program_title": meta["program_title"],
                "coach_key": meta["coach_key"],
                "coach_name": meta["coach_name"],
                "source": "backfill",
            },
        })

    sprint_meta = pack_meta(SPRINT_PROGRAM_ID, programs, coaches)
    for row in sprint_first:
        uid = row["user_id"]
        if (uid, SPRINT_PROGRAM_ID) in have_activated:
            continue
        if (uid, SPRINT_PROGRAM_ID) in activated_keys:
            continue
        events.append({
            "event": "pack_activated",
            "distinct_id": uid,
            "timestamp": row["completed_at"],
            "properties": {
                "$insert_id": f"backfill-activated-{uid}-{SPRINT_PROGRAM_ID}",
                "$lib": "backfill-script",
                "program_id": SPRINT_PROGRAM_ID,
                "program_key": sprint_meta["program_key"] or "30-day-sprint",
                "program_title": sprint_meta["program_title"] or "30-Day Sprint",
                "coach_key": sprint_meta["coach_key"] or "grant-chiasson",
                "coach_name": sprint_meta["coach_name"] or "Grant Chiasson",
                "source": "backfill",
            },
        })

    rated_n = sum(1 for e in events if e["event"] == "pack_rated")
    completed_n = sum(1 for e in events if e["event"] == "pack_completed")
    activated_n = sum(1 for e in events if e["event"] == "pack_activated")
    total = len(events)
    print(
        f"\nBuilt {total} events "
        f"(rated={rated_n} completed={completed_n} activated={activated_n})"
    )
    if DRY_RUN:
        print("Dry run — nothing sent.")
        return

    print(f"Sending to {POSTHOG_HOST}…\n")
    sent = 0
    for i in range(0, total, BATCH_SIZE):
        batch = events[i: i + BATCH_SIZE]
        if send_batch(batch):
            sent += len(batch)
            print(f"  batch {i // BATCH_SIZE + 1}: {len(batch)} events sent")
        else:
            print(f"  batch {i // BATCH_SIZE + 1}: FAILED")

    print(f"\nDone. {sent}/{total} events sent.")


if __name__ == "__main__":
    main()
