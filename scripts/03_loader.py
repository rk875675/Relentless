#!/usr/bin/env python3
"""
03_loader.py — Relentless generalized Lesson Pack Loader.

Reads a Lesson Pack (the .zip the Coach Form produces, or an unzipped folder),
and loads it into the app:

  - upserts the COACH (by coach_key) and PROGRAM (by coach_id + program_key)
  - uploads audio + images to Supabase Storage at the manifest's exact paths
  - for each lesson: builds content_blocks that match the strict Zod schema,
    generating timed_text captions (local Whisper) and total_audio_seconds (mp3),
    computing the lesson duration, and upserting the lesson + its MAC tags
  - writes new lessons as production_ready = false (preview gate)
  - ensures a Relentless V1 PostHog tile:
      "Unique users — {Full Coach Name} referral CTA"
    (idempotent; skipped if POSTHOG_PERSONAL_API_KEY is unset)

Deterministic + idempotent: re-running the same pack updates the same rows.

NO SECRETS IN THIS FILE. Reads from environment:
  SUPABASE_URL                 e.g. https://<ref>.supabase.co
  SUPABASE_SERVICE_ROLE_KEY    the rotated service-role key (never commit it)

Optional — Coach Form (portal) project, the source of truth for coach profiles
(coaches edit their profile there after exporting packs; one profile covers all
of a coach's packs). When set, the loader merges the live profile over the
pack manifest's coach snapshot:
  COACHFORM_SUPABASE_URL       e.g. https://<portal-ref>.supabase.co
  COACHFORM_SERVICE_ROLE_KEY   that project's service-role key
  COACHFORM_ASSETS_BUCKET      portal photo bucket (default: coach-assets)

Optional — PostHog (Relentless App LLC project) personal API key so each loaded
coach automatically gets a named CTA tile on the Relentless V1 dashboard:
  POSTHOG_PERSONAL_API_KEY     personal API key with insight:write (never commit)
  POSTHOG_HOST                 default https://us.posthog.com
  POSTHOG_PROJECT_ID           default 400227
  POSTHOG_DASHBOARD_ID         default 1517002 (Relentless V1)

Point these at STAGING first. Review on a dev account. Then run against prod.

Usage:
  python 03_loader.py path/to/coach_program_lesson_pack.zip
  python 03_loader.py path/to/pack.zip --dry-run     # build + review, no writes
  python 03_loader.py path/to/pack.zip --publish     # also set production_ready=true

Deps:  pip install faster-whisper mutagen     (ffmpeg must be installed for Whisper)
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import uuid
import zipfile
from urllib.parse import quote
from urllib.request import Request, urlopen
from urllib.error import HTTPError

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
URL = os.environ.get("SUPABASE_URL", "").strip().rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
PROJECT_REF = os.environ.get("SUPABASE_PROJECT_REF", "tnetahaviblrrjixzvbd")
AUDIO_BUCKET = os.environ.get("RELENTLESS_AUDIO_BUCKET", "lesson-audio")
# No separate images bucket exists today; the lessons Edge Function only signs
# audio paths in lesson-audio. Coach photos / program covers are not surfaced
# until the browse UI is built, so they harmlessly live in lesson-audio for now.
# Override RELENTLESS_IMAGE_BUCKET once a dedicated images bucket exists.
IMAGE_BUCKET = os.environ.get("RELENTLESS_IMAGE_BUCKET", "lesson-audio")

# Coach Form (portal) project — optional, see module docstring.
COACHFORM_URL = os.environ.get("COACHFORM_SUPABASE_URL", "").strip().rstrip("/")
COACHFORM_KEY = os.environ.get("COACHFORM_SERVICE_ROLE_KEY", "").strip()
COACHFORM_ASSETS_BUCKET = os.environ.get("COACHFORM_ASSETS_BUCKET", "coach-assets")

# PostHog (Relentless) — optional; creates per-coach CTA tiles on Relentless V1.
POSTHOG_PERSONAL_API_KEY = os.environ.get("POSTHOG_PERSONAL_API_KEY", "").strip()
POSTHOG_HOST = os.environ.get("POSTHOG_HOST", "https://us.posthog.com").strip().rstrip("/")
POSTHOG_PROJECT_ID = os.environ.get("POSTHOG_PROJECT_ID", "400227").strip()
POSTHOG_DASHBOARD_ID = int(os.environ.get("POSTHOG_DASHBOARD_ID", "1517002"))
POSTHOG_CTA_DATE_FROM = "2026-05-16T00:00:00"

GAP_THRESHOLD = 1.2   # seconds of silence -> force a new caption cue
MAX_CHARS = 75        # caption display limit
UUID_NS = uuid.uuid5(uuid.NAMESPACE_URL, "relentless.app/lessons")

# blocks that pass straight through (they already match the strict Zod schema)
PASSTHROUGH_TYPES = {
    "timed_exercise", "flash_cards", "journal_prompt", "prompt_cards",
    "examples_with_entry", "anchor_entry", "multi_select", "multi_field_entry",
    "physiological_sigh", "tap_through_text", "bubble_sort", "two_column_sort",
    "list_builder", "countdown_timer",
}


# ---------------------------------------------------------------------------
# REST helpers (PostgREST + Storage). Service role bypasses RLS.
# Projects with legacy keys disabled use CLI for DB and a resolved JWT for
# Storage. The fallback is transparent: if PostgREST rejects the key, we
# switch to CLI mode for all subsequent DB calls.
# ---------------------------------------------------------------------------
_USE_CLI_DB = False
_STORAGE_JWT = None


def _resolve_storage_jwt():
    """Get a JWT that Storage accepts. If KEY is already a JWT, use it.
    Otherwise fetch the legacy service_role JWT from `npx supabase projects api-keys`."""
    global _STORAGE_JWT
    if _STORAGE_JWT:
        return _STORAGE_JWT
    if KEY.startswith("ey") and KEY.count(".") == 2:
        _STORAGE_JWT = KEY
        return _STORAGE_JWT
    try:
        result = subprocess.run(
            ["npx", "supabase", "projects", "api-keys", "--project-ref", PROJECT_REF],
            capture_output=True, text=True, timeout=60, shell=True
        )
        keys = json.loads(result.stdout).get("keys", [])
        for k in keys:
            if k.get("id") == "service_role" and k.get("type") == "legacy":
                _STORAGE_JWT = k["api_key"]
                return _STORAGE_JWT
    except Exception:
        pass
    sys.exit("ERROR: cannot resolve a JWT for Storage uploads. Set SUPABASE_SERVICE_ROLE_KEY "
             "to the legacy JWT, or ensure `npx supabase` is logged in.")


def _cli_query(sql):
    """Execute SQL via the Supabase CLI (bypasses PostgREST, uses management API)."""
    result = subprocess.run(
        ["npx", "supabase", "db", "query", "--linked", "--project-ref", PROJECT_REF, sql],
        capture_output=True, text=True, timeout=60, shell=True
    )
    if result.returncode != 0:
        raise RuntimeError(f"CLI db query failed:\n{result.stderr}\n{result.stdout}")
    payload = json.loads(result.stdout)
    return payload.get("rows", [])


def _open(req, timeout):
    """urlopen that surfaces the server's response body on HTTP errors."""
    try:
        return urlopen(req, timeout=timeout)
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"HTTP {e.code} {e.reason} :: {req.get_method()} {req.full_url}\n{detail[:800]}"
        ) from None


def _auth_headers(json_body=True):
    h = {"apikey": KEY, "Authorization": f"Bearer {KEY}"}
    if json_body:
        h["Content-Type"] = "application/json"
    return h


def _sql_val(v):
    """Escape a Python value for SQL (safe for command-line transport)."""
    if v is None:
        return "NULL"
    if isinstance(v, bool):
        return "TRUE" if v else "FALSE"
    if isinstance(v, (int, float)):
        return str(v)
    if isinstance(v, dict) or isinstance(v, list):
        s = json.dumps(v, ensure_ascii=False, separators=(",", ":"))
        s = s.replace("\\", "\\\\").replace("'", "''").replace("\n", "\\n").replace("\r", "")
        return "E'" + s + "'::jsonb"
    s = str(v).replace("\\", "\\\\").replace("'", "''").replace("\n", "\\n").replace("\r", "")
    return "E'" + s + "'"


def rest_get(path_query):
    global _USE_CLI_DB
    if not _USE_CLI_DB:
        try:
            req = Request(f"{URL}/rest/v1/{path_query}", headers=_auth_headers(json_body=False))
            return json.loads(_open(req, timeout=60).read().decode("utf-8"))
        except RuntimeError as e:
            if "Legacy API keys are disabled" in str(e) or "401" in str(e):
                _USE_CLI_DB = True
                print("  (PostgREST unavailable — switching to CLI for DB ops)")
            else:
                raise
    table = path_query.split("?")[0]
    params = path_query.split("?")[1] if "?" in path_query else ""
    select = "*"
    where_parts = []
    for param in params.split("&"):
        if param.startswith("select="):
            select = param[7:]
        elif "=eq." in param:
            col, val = param.split("=eq.")
            where_parts.append(f"{col} = {_sql_val(val)}")
    where = " AND ".join(where_parts) if where_parts else "TRUE"
    return _cli_query(f"SELECT {select} FROM public.{table} WHERE {where}")


def rest_upsert(table, rows, on_conflict, returning=True):
    global _USE_CLI_DB
    if not _USE_CLI_DB:
        try:
            prefer = "resolution=merge-duplicates" + (",return=representation" if returning else "")
            url = f"{URL}/rest/v1/{table}?on_conflict={on_conflict}"
            req = Request(url, data=json.dumps(rows).encode("utf-8"), method="POST",
                          headers={**_auth_headers(), "Prefer": prefer})
            with _open(req, timeout=60) as r:
                body = r.read().decode("utf-8")
            return json.loads(body) if (returning and body) else None
        except RuntimeError as e:
            if "Legacy API keys are disabled" in str(e) or "401" in str(e):
                _USE_CLI_DB = True
                print("  (PostgREST unavailable — switching to CLI for DB ops)")
            else:
                raise
    conflict_cols = [c.strip() for c in on_conflict.split(",")]
    results = []
    for row in rows:
        cols = list(row.keys())
        vals = [_sql_val(row[c]) for c in cols]
        update_cols = [c for c in cols if c not in conflict_cols]
        if update_cols:
            update_set = ", ".join(f"{c} = EXCLUDED.{c}" for c in update_cols)
            conflict_clause = f"DO UPDATE SET {update_set}"
        else:
            conflict_clause = "DO NOTHING"
        sql = (f"INSERT INTO public.{table} ({', '.join(cols)}) "
               f"VALUES ({', '.join(vals)}) "
               f"ON CONFLICT ({on_conflict}) {conflict_clause}")
        if returning:
            sql += " RETURNING *"
        result = _cli_query(sql)
        if returning and result:
            results.append(result[0])
    return results if returning else None


def rest_delete(table, fil_query):
    global _USE_CLI_DB
    if not _USE_CLI_DB:
        try:
            url = f"{URL}/rest/v1/{table}?{fil_query}"
            req = Request(url, method="DELETE", headers=_auth_headers())
            _open(req, timeout=60).read()
            return
        except RuntimeError as e:
            if "Legacy API keys are disabled" in str(e) or "401" in str(e):
                _USE_CLI_DB = True
                print("  (PostgREST unavailable — switching to CLI for DB ops)")
            else:
                raise
    where_parts = []
    for param in fil_query.split("&"):
        if "=eq." in param:
            col, val = param.split("=eq.")
            where_parts.append(f"{col} = {_sql_val(val)}")
    where = " AND ".join(where_parts) if where_parts else "FALSE"
    _cli_query(f"DELETE FROM public.{table} WHERE {where}")


def storage_upload(bucket, path, data, content_type):
    """Upload to Storage using a resolved JWT (legacy key still works for Storage
    even when PostgREST legacy keys are disabled)."""
    jwt = _resolve_storage_jwt()
    url = f"{URL}/storage/v1/object/{bucket}/{path}"
    headers = {
        "apikey": jwt, "Authorization": f"Bearer {jwt}",
        "Content-Type": content_type, "x-upsert": "true",
    }
    req = Request(url, data=data, method="POST", headers=headers)
    _open(req, timeout=600).read()


def content_type_for(path):
    p = path.lower()
    if p.endswith(".mp3"):
        return "audio/mpeg"
    if p.endswith(".png"):
        return "image/png"
    if p.endswith(".jpg") or p.endswith(".jpeg"):
        return "image/jpeg"
    if p.endswith(".heic"):
        return "image/heic"
    if p.endswith(".heif"):
        return "image/heif"
    if p.endswith(".webp"):
        return "image/webp"
    return "application/octet-stream"


# ---------------------------------------------------------------------------
# Coach Form (portal) profile merge. The portal's coaches table has no
# coach_key; the Coach Form derives a pack's coach_key from the display name,
# so we match by slug(display_name). Service-role key required (RLS bypass).
# NOTE: a non-browser User-Agent is required — Supabase rejects sb_secret keys
# sent from browser-looking clients.
# ---------------------------------------------------------------------------
def _coachform_headers():
    return {"apikey": COACHFORM_KEY, "Authorization": f"Bearer {COACHFORM_KEY}",
            "User-Agent": "relentless-loader/1.0"}


# Coach-card CTAs sit beside "About Me" — keep labels short so new packs
# don't overflow the two-button row (Brock's original 42-char label did).
_OFFER_LABEL_MAX = 22


def _short_offer_label(label, warnings=None, coach_key=None):
    if not label:
        return label
    if len(label) <= _OFFER_LABEL_MAX:
        return label
    note = (
        f"offer_label {label!r} is {len(label)} chars (max {_OFFER_LABEL_MAX}); "
        f"using 'Book a call'"
    )
    if coach_key:
        note = f"{coach_key}: {note}"
    if warnings is not None:
        warnings.append(note)
    else:
        print(f"  !! {note}")
    return "Book a call"


def _slugify(name):
    out = "".join(c if c.isalnum() else "-" for c in (name or "").strip().lower())
    while "--" in out:
        out = out.replace("--", "-")
    return out.strip("-")


def coachform_profile(coach_key, warnings):
    """Fetch the canonical coach profile from the Coach Form project, matched by
    slug(display_name) == coach_key. Returns None (with a warning) when the
    portal is not configured or there is not exactly one match — never guesses."""
    if not (COACHFORM_URL and COACHFORM_KEY):
        return None
    req = Request(f"{COACHFORM_URL}/rest/v1/coaches?select=*", headers=_coachform_headers())
    rows = json.loads(_open(req, timeout=30).read().decode("utf-8"))
    matches = [r for r in rows if _slugify(r.get("display_name")) == coach_key]
    if len(matches) != 1:
        warnings.append(
            f"coach form: {len(matches)} profiles match coach_key {coach_key!r} "
            "— using the pack manifest's coach snapshot instead"
        )
        return None
    return matches[0]


def coachform_photo_bytes(photo_path):
    if not photo_path:
        return None
    req = Request(
        f"{COACHFORM_URL}/storage/v1/object/{COACHFORM_ASSETS_BUCKET}/{photo_path}",
        headers=_coachform_headers(),
    )
    return _open(req, timeout=120).read()


# These lessons have NO ambient audio. The loader strips any ambient_audio key
# the manifest might still carry (the Coach Form is being updated to stop
# emitting it), so it never reaches content_blocks or storage.
def strip_ambient(block):
    return {k: v for k, v in block.items() if k != "ambient_audio"}


# Coach Portal 2026-07-01 breathing changes (manifest schema still "2.0"):
#   - visual_cues was removed from breathing blocks (drop it if an older pack
#     still carries it — the app no longer needs it for flexible breathing).
#   - the single optional mid_overlay object became a mid_overlays ARRAY that is
#     always present (empty [] when none). Drop the key when empty so
#     content_blocks stays lean; keep the array when it has overlays.
# Older packs with a legacy single mid_overlay object pass through unchanged.
def normalize_breathing(block):
    if not (block.get("type") == "timed_exercise" and block.get("interactive_model") == "breathing"):
        return block
    out = {k: v for k, v in block.items() if k != "visual_cues"}
    if "mid_overlays" in out and not out["mid_overlays"]:
        del out["mid_overlays"]
    return out


# ---------------------------------------------------------------------------
# Whisper captions (local, free). Reused from gen_sentence_cues_15_30.py logic:
# group words into sentence/clause cues; start_s = first word; <= MAX_CHARS.
# ---------------------------------------------------------------------------
_WHISPER = None


def _whisper():
    global _WHISPER
    if _WHISPER is None:
        from faster_whisper import WhisperModel
        print("Loading faster-whisper base.en ...", flush=True)
        _WHISPER = WhisperModel("base.en", device="cpu", compute_type="int8")
    return _WHISPER


def _ends_sentence(w):
    t = w.rstrip()
    return t.endswith(".") or t.endswith("?") or t.endswith("!")


def _cap(t):
    return (t[0].upper() + t[1:]) if t else t


# When a token STARTS with one of these it attaches to the previous word with no
# leading space, so Whisper tokens like "one", "-on", "-one" detokenize to
# "one-on-one" and "word", "," -> "word," (not "word ,").
_ATTACH_LEFT_PREFIXES = (",", ".", ";", ":", "!", "?", ")", "]", "}", "'", "\u2019", "-", "\u2014", "\u2013", "%")
# Word-final punctuation that marks a natural clause boundary we may break after.
_CLAUSE_END = (",", ";", ":", "\u2014", "\u2013")

# Known Whisper homophone slips to correct in generated captions. The AUDIO is
# correct; the transcript mishears it (e.g. "day two" -> "today too"). Exact,
# case-sensitive substring replacements applied to every generated cue so a
# re-load never re-introduces a fixed caption. Add pairs here as they surface.
_CAPTION_TEXT_FIXES = (
    ("welcome today too", "welcome to day two"),
    ("Welcome today too", "Welcome to day two"),
)


def _apply_caption_fixes(cues):
    for c in cues:
        t = c.get("text", "")
        for wrong, right in _CAPTION_TEXT_FIXES:
            if wrong in t:
                t = t.replace(wrong, right)
        c["text"] = t
    return cues


def _detok(tokens):
    """Join Whisper word tokens into natural text without spurious spaces before
    punctuation or hyphenated continuations (e.g. 'one-on-one', 'sport,')."""
    out = ""
    for tok in tokens:
        t = tok.strip()
        if not t:
            continue
        if not out:
            out = t
        elif t[0] in _ATTACH_LEFT_PREFIXES:
            out += t
        else:
            out += " " + t
    return out


def _text_of(words):
    return _detok([w["word"] for w in words]).strip()


def _split_long(words, warnings=None):
    """Split an over-long sentence into <= MAX_CHARS cues, breaking only at natural
    clause boundaries (commas, dashes, etc.), never mid-clause. Falls back to a
    word boundary only when a single clause itself exceeds MAX_CHARS. Every word is
    kept verbatim; start_s = first word of each cue. Implements the days 8-30 rule
    (CONTENT_DELIVERY_GUIDE 12d/12e): a cue is a complete sentence or natural
    clause, never a mid-stream fragment. A non-clause fallback break is flagged so
    a reviewer can minimally paraphrase that sentence (the 12e manual step)."""
    cues, buf = [], []
    for w in words:
        buf.append(w)
        if len(_text_of(buf)) > MAX_CHARS and len(buf) > 1:
            cut = -1
            for j in range(len(buf) - 2, -1, -1):
                if buf[j]["word"].strip().endswith(_CLAUSE_END):
                    cut = j
                    break
            if cut >= 0:
                cues.append(buf[: cut + 1])
                buf = buf[cut + 1:]
            else:
                if warnings is not None:
                    warnings.append(
                        "long sentence split mid-stream (no clause boundary) — "
                        f"paraphrase to <= {MAX_CHARS} chars at review: {_text_of(buf[:-1])!r}"
                    )
                cues.append(buf[:-1])
                buf = [w]
    if buf:
        cues.append(buf)
    return [{"start_s": round(c[0]["start"], 2), "text": _cap(_text_of(c))} for c in cues]


def _words_to_cues(words, warnings=None):
    groups, buf = [], []
    for i, w in enumerate(words):
        buf.append(w)
        if _ends_sentence(w["word"]) or (i + 1 < len(words) and (words[i + 1]["start"] - w["end"]) >= GAP_THRESHOLD):
            groups.append(buf); buf = []
    if buf:
        groups.append(buf)
    cues = []
    for g in groups:
        text = _text_of(g)
        if len(text) <= MAX_CHARS:
            cues.append({"start_s": round(g[0]["start"], 2), "text": _cap(text)})
        else:
            cues.extend(_split_long(g, warnings))
    return _apply_caption_fixes(cues)


def transcribe(path, offset=0.0, warnings=None):
    segs, _ = _whisper().transcribe(path, word_timestamps=True, language="en",
                                    beam_size=5, vad_filter=False)
    words = []
    for s in segs:
        for w in (s.words or []):
            words.append({"start": w.start + offset, "end": w.end + offset, "word": w.word})
    return _words_to_cues(words, warnings)


# ---------------------------------------------------------------------------
# Block + lesson building
# ---------------------------------------------------------------------------
def mp3_seconds(path):
    from mutagen.mp3 import MP3
    return round(MP3(path).info.length, 2)


def build_voiceover(block, pack_dir, dry_run, warnings):
    """Upload each segment, build a clean voiceover block (drops 'script',
    fills total_audio_seconds + cumulative timed_text). No 'script' key —
    it is NOT in the content_blocks schema and would be dropped."""
    audio_paths, cues, total, offset = [], [], 0.0, 0.0
    for rel in block["audio_files"]:
        local = os.path.join(pack_dir, *rel.split("/"))
        if not os.path.exists(local):
            raise FileNotFoundError(f"Missing bundled audio: {local}")
        dur = mp3_seconds(local)
        if not dry_run:
            with open(local, "rb") as f:
                storage_upload(AUDIO_BUCKET, rel, f.read(), "audio/mpeg")
        cues.extend(transcribe(local, offset=offset, warnings=warnings))
        audio_paths.append(rel)
        offset += dur
        total += dur
    for c in cues:
        if len(c["text"]) > MAX_CHARS:
            warnings.append(f"caption > {MAX_CHARS} chars: {c['text']!r}")
    return {"type": "voiceover", "audio_files": audio_paths,
            "total_audio_seconds": round(total, 2), "timed_text": cues}


def estimate_duration(blocks):
    total = 0.0
    for b in blocks:
        t = b["type"]
        if t == "voiceover":
            total += b.get("total_audio_seconds", 0) or 0
        elif t == "timed_exercise":
            total += b.get("duration_seconds", 30)
        elif t == "physiological_sigh":
            total += b.get("estimated_duration_seconds", 60)
        elif t == "countdown_timer":
            total += b.get("duration_seconds", 60)
        elif t == "flash_cards":
            total += len(b.get("cards", [])) * 10
        elif t == "journal_prompt":
            total += 60
        else:
            total += 30
    return int(round(total))


def validate_lesson(seq, blocks, warnings):
    types = [b["type"] for b in blocks]
    if "voiceover" not in types:
        warnings.append(f"lesson {seq}: no voiceover block")
    if not any(t in types for t in
               ("timed_exercise", "physiological_sigh", "flash_cards", "prompt_cards",
                "examples_with_entry", "anchor_entry", "multi_select", "multi_field_entry")):
        warnings.append(f"lesson {seq}: no exercise block")
    jp = [i for i, t in enumerate(types) if t == "journal_prompt"]
    if len(jp) > 1:
        warnings.append(f"lesson {seq}: more than one journal_prompt")
    if jp and jp[0] != len(types) - 1:
        warnings.append(f"lesson {seq}: journal_prompt is not the last block")

    # Flexible breathing: duration_seconds must equal one full pattern cycle times
    # rep_count, so the player ends on a clean phase boundary (never mid-breath).
    for b in blocks:
        if b.get("type") == "timed_exercise" and b.get("interactive_model") == "breathing":
            pat = b.get("pattern") or []
            cycle = sum(p.get("duration_seconds", 0) for p in pat)
            reps = b.get("rep_count", 1) or 1
            expected = cycle * reps
            if pat and b.get("duration_seconds") != expected:
                warnings.append(
                    f"lesson {seq}: breathing duration_seconds={b.get('duration_seconds')} "
                    f"!= sum(pattern)*rep_count={expected}"
                )
            # mid_overlays: each overlay starts when rep after_rep completes, so
            # after_rep must leave at least one rep to show over.
            for ov in (b.get("mid_overlays") or []):
                if ov.get("after_rep", 0) >= reps:
                    warnings.append(
                        f"lesson {seq}: breathing mid_overlay after_rep={ov.get('after_rep')} "
                        f">= rep_count={reps} (overlay would start after the exercise ends)"
                    )


# ---------------------------------------------------------------------------
# PostHog — per-coach CTA tile on Relentless V1 (idempotent)
# ---------------------------------------------------------------------------
def _posthog_headers():
    return {
        "Authorization": f"Bearer {POSTHOG_PERSONAL_API_KEY}",
        "Content-Type": "application/json",
        "User-Agent": "relentless-loader/1.0",
    }


def _posthog_open(req, timeout=60):
    try:
        return urlopen(req, timeout=timeout)
    except HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"HTTP {e.code} {e.reason} :: {req.get_method()} {req.full_url}\n{detail[:800]}"
        ) from None


def coach_cta_tile_name(full_name):
    """Dashboard-visible title — always the coach's full display name."""
    return f"Unique users — {full_name} referral CTA"


def _coach_cta_insight_query(coach_key):
    # Grant historically used both underscore and hyphen keys.
    keys = [coach_key]
    if coach_key == "grant-chiasson":
        keys = ["grant_chiasson", "grant-chiasson"]
    return {
        "kind": "InsightVizNode",
        "source": {
            "kind": "TrendsQuery",
            "version": 3,
            "interval": "day",
            "dateRange": {
                "date_from": POSTHOG_CTA_DATE_FROM,
                "date_to": None,
                "explicitDate": False,
            },
            "filterTestAccounts": True,
            "properties": [],
            "series": [{
                "kind": "EventsNode",
                "event": "partner_referral_cta_clicked",
                "name": "partner_referral_cta_clicked",
                "math": "dau",
                "properties": [{
                    "key": "referral_partner_key",
                    "type": "event",
                    "operator": "exact",
                    "value": keys,
                }],
            }],
            "trendsFilter": {
                "display": "ActionsLineGraphCumulative",
                "aggregationAxisFormat": "numeric",
                "legendPosition": "bottom",
                "showLegend": False,
                "showValuesOnSeries": False,
                "smoothingIntervals": 1,
                "yAxisScaleType": "linear",
                "metricShowChange": True,
                "metricSummary": "total",
                "excludeBoxPlotOutliers": True,
                "showAnnotations": True,
                "showAlertThresholdLines": False,
                "showMultipleYAxes": False,
                "showPercentStackView": False,
                "stackBreakdownValues": False,
                "hideWeekends": False,
            },
        },
    }


def ensure_posthog_coach_cta_tile(coach_key, full_name, warnings):
    """Create (or no-op if present) the Relentless V1 unique-users CTA tile for
    this coach. Uses the coach's FULL display name in the tile title so the
    dashboard is obvious without decoding slugs. Requires POSTHOG_PERSONAL_API_KEY
    with insight:write — never hardcode it."""
    if not POSTHOG_PERSONAL_API_KEY:
        warnings.append(
            "PostHog CTA tile skipped: set POSTHOG_PERSONAL_API_KEY "
            "(personal key with insight:write) to auto-create "
            f"{coach_cta_tile_name(full_name)!r} on Relentless V1"
        )
        return None

    tile_name = coach_cta_tile_name(full_name)
    description = (
        f"Cumulative unique users clicking {full_name} partner referral CTA "
        f"(coach_key {coach_key})."
    )
    base = f"{POSTHOG_HOST}/api/projects/{POSTHOG_PROJECT_ID}/insights/"

    # Idempotent lookup by exact title (search is fuzzy; we exact-match locally).
    search_url = f"{base}?limit=50&search={quote(full_name)}"
    req = Request(search_url, headers=_posthog_headers())
    payload = json.loads(_posthog_open(req).read().decode("utf-8"))
    results = payload.get("results") if isinstance(payload, dict) else payload
    existing = next((r for r in (results or []) if r.get("name") == tile_name), None)

    if existing:
        dashboards = list(existing.get("dashboards") or [])
        insight_id = existing["id"]
        if POSTHOG_DASHBOARD_ID not in dashboards:
            dashboards.append(POSTHOG_DASHBOARD_ID)
            patch = Request(
                f"{base}{insight_id}/",
                data=json.dumps({"dashboards": dashboards}).encode("utf-8"),
                method="PATCH",
                headers=_posthog_headers(),
            )
            _posthog_open(patch).read()
            print(f"posthog: attached existing tile to Relentless V1 — {tile_name}")
        else:
            print(f"posthog: CTA tile already present — {tile_name}")
        return insight_id

    body = {
        "name": tile_name,
        "description": description,
        "saved": True,
        "favorited": False,
        "dashboards": [POSTHOG_DASHBOARD_ID],
        "query": _coach_cta_insight_query(coach_key),
    }
    create = Request(
        base,
        data=json.dumps(body).encode("utf-8"),
        method="POST",
        headers=_posthog_headers(),
    )
    created = json.loads(_posthog_open(create).read().decode("utf-8"))
    print(f"posthog: created CTA tile — {tile_name} (id={created.get('id')})")
    return created.get("id")


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pack", help="Lesson Pack .zip or unzipped folder")
    ap.add_argument("--dry-run", action="store_true", help="build + review only, no DB/storage writes")
    ap.add_argument("--publish", action="store_true", help="set production_ready = true (default false)")
    args = ap.parse_args()

    if not args.dry_run and (not URL or not KEY):
        sys.exit("ERROR: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars (or use --dry-run).")

    # Resolve pack dir (extract zip if needed)
    tmp = None
    if os.path.isdir(args.pack):
        pack_dir = args.pack
    else:
        tmp = tempfile.mkdtemp(prefix="relentless_pack_")
        with zipfile.ZipFile(args.pack) as z:
            z.extractall(tmp)
        pack_dir = tmp

    with open(os.path.join(pack_dir, "manifest.json"), encoding="utf-8") as f:
        m = json.load(f)
    if m.get("schema_version") != "2.0":
        sys.exit(f"ERROR: expected schema_version 2.0, got {m.get('schema_version')!r}")

    coach, program = m["coach"], m["program"]
    ck, pk = coach["coach_key"], program["program_key"]
    warnings = []

    print(f"\nPack: coach={ck}  program={pk}  lessons={len(program['lessons'])}"
          f"  {'(DRY RUN)' if args.dry_run else ''}\n")

    # --- Coach profile: live portal profile wins over the pack's snapshot ---
    cf = coachform_profile(ck, warnings)
    print("coach profile: merged from Coach Form portal" if cf
          else "coach profile: pack manifest snapshot (portal not configured / no match)")

    # --- Upload coach photo + program cover ---
    def upload_image(rel):
        if not rel:
            return
        local = os.path.join(pack_dir, *rel.split("/"))
        if os.path.exists(local) and not args.dry_run:
            with open(local, "rb") as fh:
                storage_upload(IMAGE_BUCKET, rel, fh.read(), content_type_for(rel))

    photo_rel = coach.get("photo") or (f"coach/{ck}.png" if cf and cf.get("photo_path") else None)
    portal_photo = None
    if cf and cf.get("photo_path") and not args.dry_run:
        portal_photo = coachform_photo_bytes(cf["photo_path"])
    if portal_photo and photo_rel:
        storage_upload(IMAGE_BUCKET, photo_rel, portal_photo, content_type_for(photo_rel))
    else:
        upload_image(coach.get("photo"))

    # --- Portal intro video: copy to app storage if present ---
    # The video is stored as-is in the app bucket under coach/<coach_key>_intro.<ext>.
    # intro_video_approved stays false (default) — admin must set it manually.
    # Note: the portal column is named "video_path" (not "intro_video_path").
    portal_video_rel = None
    if cf and cf.get("video_path") and not args.dry_run:
        portal_video_path = cf["video_path"]
        # Derive extension from the portal path (e.g. .mp4); default to .mp4.
        ext = portal_video_path.rsplit(".", 1)[-1] if "." in portal_video_path else "mp4"
        portal_video_rel = f"coach/{ck}_intro.{ext}"
        try:
            req = Request(
                f"{COACHFORM_URL}/storage/v1/object/{COACHFORM_ASSETS_BUCKET}/{portal_video_path}",
                headers=_coachform_headers(),
            )
            video_bytes = _open(req, timeout=300).read()
            storage_upload(IMAGE_BUCKET, portal_video_rel, video_bytes, f"video/{ext}")
            print(f"  intro video uploaded -> {portal_video_rel}")
        except Exception as e:
            warnings.append(f"intro video upload failed for {ck!r}: {e}")
            portal_video_rel = None
    # Coach Portal 2026-07-01: program.cover_image was removed from the manifest
    # (the coach photo represents the program). Nothing to upload here anymore.

    # --- Upsert coach (by coach_key) -> coach_id ---
    def _trimmed(v):
        return v.strip() if isinstance(v, str) and v.strip() else None

    def pick(portal_field, manifest_value):
        return (_trimmed(cf.get(portal_field)) if cf else None) or manifest_value

    coach_row = {
        "coach_key": ck,
        "name": pick("display_name", coach["display_name"]),
        "credentials": pick("credentials", coach.get("credentials")),
        # NOTE: "bio" (curated 1-2 line short intro) is intentionally NOT auto-set here.
        # The portal "bio" column holds the coach's own long description, which goes to
        # long_bio (About Me section). After loading, manually write a curated short bio
        # into the `bio` column via SQL. Omitting it from coach_row means re-loading a
        # pack never overwrites an already-curated bio.
        "offer_label": _short_offer_label(
            pick("offer_label", coach.get("offer", {}).get("label")),
            warnings,
            ck,
        ),
        "external_url": pick("offer_url", coach.get("offer", {}).get("url")),
        "avatar_url": photo_rel,
    }
    if portal_video_rel:
        # Only write the path; approval stays false until admin review.
        coach_row["intro_video_path"] = portal_video_rel
    # Portal "bio" IS the coach's long description → long_bio (the "About Me" collapsible).
    # Use pack manifest as fallback so offline/dry-run loads still populate it.
    long_bio_val = pick("bio", coach.get("bio"))
    if long_bio_val:
        coach_row["long_bio"] = long_bio_val
    coach_sport = pick("sport", program.get("sport"))
    if coach_sport:
        coach_row["sport"] = coach_sport
    if cf:
        coach_row["coachform_id"] = cf["id"]
    if args.dry_run:
        coach_id = "<dry-run-coach-id>"
    else:
        # Rename-safe convergence: coach_key derives from the display name, so a
        # portal rename changes it. If a coach row already carries this portal
        # id, update THAT row (its coach_key moves to the new slug) instead of
        # forking a second coach.
        existing = rest_get(f"coaches?coachform_id=eq.{cf['id']}&select=id") if cf else []
        if existing:
            coach_row["id"] = existing[0]["id"]
            coach_id = rest_upsert("coaches", [coach_row], on_conflict="id")[0]["id"]
        else:
            coach_id = rest_upsert("coaches", [coach_row], on_conflict="coach_key")[0]["id"]
    print(f"coach_id = {coach_id}")

    # --- PostHog: ensure per-coach CTA tile on Relentless V1 (full name) ---
    coach_full_name = (coach_row.get("name") or "").strip() or ck
    if args.dry_run:
        print(f"posthog: would ensure CTA tile — {coach_cta_tile_name(coach_full_name)}")
    else:
        try:
            ensure_posthog_coach_cta_tile(ck, coach_full_name, warnings)
        except Exception as e:
            warnings.append(f"PostHog CTA tile failed for {coach_full_name!r}: {e}")

    # --- Upsert program (by coach_id + program_key) -> program_id ---
    # cover_image is intentionally NOT written: the Coach Portal no longer emits
    # it, and omitting the key leaves any existing DB value untouched on re-load.
    # The app uses coach.avatar_url wherever a program image is shown.
    program_row = {
        "coach_id": coach_id,
        "program_key": pk,
        "title": program["title"],
        "description": program.get("description"),
        "sport": program.get("sport"),
        "level": program.get("level"),
        "published": True,
        "production_ready": bool(args.publish),
    }
    if args.dry_run:
        program_id = "<dry-run-program-id>"
    else:
        program_id = rest_upsert("programs", [program_row], on_conflict="coach_id,program_key")[0]["id"]
    print(f"program_id = {program_id}\n")

    review = {"coach_id": coach_id, "program_id": program_id, "lessons": []}

    # --- Lessons ---
    for lesson in program["lessons"]:
        seq = lesson["sequence"]
        out_blocks = []
        for b in lesson["blocks"]:
            if b["type"] == "voiceover":
                out_blocks.append(build_voiceover(b, pack_dir, args.dry_run, warnings))
            elif b["type"] in PASSTHROUGH_TYPES:
                # Already schema-shaped; strip ambient_audio (no ambient in these
                # lessons) and normalize breathing (visual_cues / mid_overlays).
                out_blocks.append(normalize_breathing(strip_ambient(b)))
            else:
                raise ValueError(f"lesson {seq}: unknown block type {b['type']!r}")

        validate_lesson(seq, out_blocks, warnings)
        duration = estimate_duration(out_blocks)
        content_blocks = {"blocks": out_blocks}
        lesson_id = str(uuid.uuid5(UUID_NS, f"{ck}:{pk}:{seq}"))

        lesson_row = {
            "id": lesson_id,
            "coach_id": coach_id,
            "program_id": program_id,
            "title": lesson["title"],
            # Optional pre-lesson blurb (lessons.description). NULL = the app
            # hides the description block, so older packs load unchanged.
            "description": lesson.get("description"),
            "duration_seconds": duration,
            "lesson_type": "standard",
            "sequence": seq,
            "sort_order": seq,
            "published": True,
            "production_ready": bool(args.publish),
            "content_blocks": content_blocks,
        }

        if not args.dry_run:
            rest_upsert("lessons", [lesson_row], on_conflict="id", returning=False)
            rest_delete("lesson_categories", f"lesson_id=eq.{lesson_id}")
            cats = [{"lesson_id": lesson_id, "category": c} for c in lesson["mac_categories"]]
            if cats:
                rest_upsert("lesson_categories", cats, on_conflict="lesson_id,category", returning=False)

        print(f"  lesson {seq:>2}  {lesson['title'][:48]:<48}  {duration}s  "
              f"[{','.join(lesson['mac_categories'])}]")
        review["lessons"].append({"sequence": seq, "lesson_id": lesson_id,
                                  "title": lesson["title"], "duration_seconds": duration,
                                  "content_blocks": content_blocks})

    # --- Suggestions + review artifact ---
    if m.get("exercise_suggestions"):
        review["exercise_suggestions"] = m["exercise_suggestions"]
        print("\nEXERCISE SUGGESTIONS (review, not loaded):")
        for s in m["exercise_suggestions"]:
            print("  - " + s)

    out_path = os.path.join(os.getcwd(), f"loader_review_{ck}_{pk}.json")
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(review, f, ensure_ascii=False, indent=2)
    print(f"\nReview written: {out_path}")

    if warnings:
        print(f"\n  {len(warnings)} WARNING(S):")
        for w in warnings:
            print("   - " + w)

    print("\nDONE." + ("" if args.publish else
          "  Lessons loaded as production_ready=false — review on a dev account, "
          "then flip production_ready to true to launch."))
    if tmp:
        import shutil
        shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    main()
