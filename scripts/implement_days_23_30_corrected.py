"""
Implement corrected Days 23 and 30.
1. Upload new audio to Supabase Storage (overwrite existing files)
2. Run Whisper base.en word-level transcription -> sentence-grouped timed_text
3. Write updated content/lessons/lesson_23.json and lesson_30.json
4. Generate supabase/migrations/20260508000000_wod_days_23_30_corrected.sql

Day 23: completely new content — guided future visualization, 4-card prompt_cards exercise.
         visualization_board block type replaced by prompt_cards.
Day 30: corrected — program_completion replaced by prompt_cards; voiceover references
         Day 23 journal entry instead of the old visualization board UI.
         seg_02 content identical to previous recording (keep same Whisper pass).
"""

import json
import os
import sys
import urllib.request

from faster_whisper import WhisperModel
from mutagen.mp3 import MP3

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------
SRC_DIR    = r"C:\Users\rkuma\Downloads\RELENTLESS\CONTENT\LESSONS 23, 30 FIXED"
LESSON_DIR = os.path.join(os.path.dirname(__file__), '..', 'content', 'lessons')
MIGS_DIR   = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations')
OUT_MIG    = os.path.join(MIGS_DIR, '20260508000000_wod_days_23_30_corrected.sql')

SUPABASE_URL     = "https://tnetahaviblrrjixzvbd.supabase.co"
SERVICE_ROLE_KEY = (
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9"
    ".eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRuZXRhaGF2aWJscnJqaXh6dmJkIiwicm9sZSI6"
    "InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3NDMwNDgwMCwiZXhwIjoyMDg5ODgwODAwfQ"
    ".6cQlEidIUoGziBrEwZ-S94hUcjwxKILBUdHtP22zWNM"
)
BUCKET = "lesson-audio"

# (local_filename, storage_path)
UPLOADS = [
    ("Lesson_23_Seg_01.MP3",  "lesson_23/lesson_23_seg_01.mp3"),
    ("lesson_23_seg_02.MP3",  "lesson_23/lesson_23_seg_02.mp3"),
    ("lesson_30_seg_1.MP3",   "lesson_30/lesson_30_seg_01.mp3"),   # note: no zero-pad in local name
    ("lesson_30_seg_02.MP3",  "lesson_30/lesson_30_seg_02.mp3"),
]

ACTUAL_DUR = {
    23: {"seg_01": 106.45, "seg_02": 19.23},
    30: {"seg_01": 93.02,  "seg_02": 41.59},
}

UUID_FMT      = 'd0000000-0000-0000-0000-{:012d}'
GAP_THRESHOLD = 1.2
MAX_CHARS     = 120    # flag for review; hard <=75 enforced in OVERRIDES
OVERRIDE_THRESHOLD = 75   # apply to any cue over the display limit

# ---------------------------------------------------------------------------
# OVERRIDES: minimal paraphrases for cues > 75 chars after Whisper grouping.
# All ≤ 75 chars; verbatim words kept as close as possible.
# ---------------------------------------------------------------------------
OVERRIDES = {
    # -- Day 23 seg_01 --
    (23, 1.42):    "Today we're doing something I do with every athlete I work with.",
    (23, 18.42):   "Five to ten years from now — the life where the work paid off.",
    (23, 25.6):    "Where the goals you've been chasing actually happened.",
    (23, 68.56):   "Pride, satisfaction, gratitude — you didn't quit when it was hard.",
    (23, 87.54):   "What is one step you can take today that moves the needle?",
    (23, 97.06):   "On your screen, you'll build this visualization in your journal.",
    (23, 102.76):  "This is one of the most important things we've done in this program.",
    # -- Day 23 seg_02 --
    (23, 0.0):     "That visualization lives in your journal. Come back to it.",

    # -- Day 30 seg_01 --
    (30, 5.22):    "Most people quit around Day 8 or 15, when it starts feeling like work.",
    (30, 22.48):   "No reset word, no If-Then plan, no evidence log, no traffic light system.",
    (30, 42.52):   "Not because someone gave it to you — you built it, rep by rep, day by day.",
    (30, 49.9):    "The question to carry forward: the one that keeps athletes growing.",
    (30, 64.62):   "Take it into every season, every competition, every time you plateau.",
    (30, 72.86):   "Before you journal — go back to your Day 23 visualization and read it.",
    (30, 80.76):   "Sit inside that moment again. Then read your evidence log — every entry.",
    # -- Day 30 seg_02 --
    (30, 2.72):    "You know it in how you showed up, how you handled the last competition.",
    (30, 16.68):   "Keep the log, run the routine, use the tools, build on your why.",
    (30, 24.92):   "When it gets hard, you've been here before and came out with a plan.",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def upload_file(local_name, remote_path):
    local_full = os.path.join(SRC_DIR, local_name)
    url = f"{SUPABASE_URL}/storage/v1/object/{BUCKET}/{remote_path}"
    with open(local_full, "rb") as f:
        data = f.read()
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Authorization": f"Bearer {SERVICE_ROLE_KEY}",
        "Content-Type": "audio/mpeg",
        "x-upsert": "true",
    })
    with urllib.request.urlopen(req, timeout=120) as resp:
        return resp.status


def ends_sentence(word_text):
    t = word_text.rstrip()
    return t.endswith('.') or t.endswith('?') or t.endswith('!')


def words_to_cues(words):
    cues = []
    buf = []
    for i, w in enumerate(words):
        buf.append(w)
        commit = False
        if ends_sentence(w['word']):
            commit = True
        elif i + 1 < len(words) and words[i + 1]['start'] - w['end'] >= GAP_THRESHOLD:
            commit = True
        if commit:
            text = ' '.join(x['word'].strip() for x in buf).strip()
            if text:
                text = text[0].upper() + text[1:]
            cues.append({'start_s': round(buf[0]['start'], 2), 'text': text})
            buf = []
    if buf:
        text = ' '.join(x['word'].strip() for x in buf).strip()
        if text:
            text = text[0].upper() + text[1:]
        cues.append({'start_s': round(buf[0]['start'], 2), 'text': text})
    return cues


def transcribe(model, local_path):
    segs, _ = model.transcribe(local_path, word_timestamps=True, language='en',
                                beam_size=5, vad_filter=False)
    words = []
    for seg in segs:
        if seg.words:
            for w in seg.words:
                words.append({'start': w.start, 'end': w.end, 'word': w.word})
    return words_to_cues(words)


def apply_overrides(day, cues, consumed):
    """Apply overrides with ±0.3s fuzzy matching on start_s."""
    for cue in cues:
        if len(cue['text']) <= OVERRIDE_THRESHOLD:
            continue
        # Try exact key first, then fuzzy ±0.3s
        match_key = None
        exact = (day, cue['start_s'])
        if exact in OVERRIDES and exact not in consumed:
            match_key = exact
        else:
            for k, v in OVERRIDES.items():
                if k[0] == day and abs(k[1] - cue['start_s']) <= 0.3 and k not in consumed:
                    match_key = k
                    break
        if match_key:
            cue['text'] = OVERRIDES[match_key]
            consumed.add(match_key)
    return cues


def sql_escape(s):
    return s.replace("'", "''")


def lesson_duration(blocks):
    total = 0
    for b in blocks:
        t = b['type']
        if t == 'voiceover':       total += b['total_audio_seconds']
        elif t == 'timed_exercise': total += b.get('duration_seconds', 0)
        elif t == 'prompt_cards':   total += len(b.get('cards', [])) * 25
        elif t == 'journal_prompt': total += 60
        else:                       total += 30
    return int(total)


# ---------------------------------------------------------------------------
# Step 1 — Upload audio (already uploaded; skip on re-runs by setting to False)
# ---------------------------------------------------------------------------
SKIP_UPLOAD = True
if not SKIP_UPLOAD:
    print("=== Uploading audio files ===")
    for local_name, remote_path in UPLOADS:
        print(f"  {remote_path} ...", end=' ', flush=True)
        status = upload_file(local_name, remote_path)
        print(f"OK ({status})")
else:
    print("=== Upload skipped (already done) ===")

# ---------------------------------------------------------------------------
# Step 2 — Whisper transcription
# ---------------------------------------------------------------------------
print("\n=== Loading Whisper base.en model ===", flush=True)
model = WhisperModel("base.en", device="cpu", compute_type="int8")
print("Model loaded.\n")

transcriptions = {}
for local_name, remote_path in UPLOADS:
    local_full = os.path.join(SRC_DIR, local_name)
    label = os.path.basename(remote_path)
    print(f"  Transcribing {label} ...", flush=True)
    cues = transcribe(model, local_full)
    print(f"  -> {len(cues)} cue(s)")
    transcriptions[remote_path] = cues

# ---------------------------------------------------------------------------
# Step 3 — Build lesson blocks
# ---------------------------------------------------------------------------

# --- Day 23 ---
consumed_23 = set()
vo1_cues_23 = apply_overrides(23, transcriptions["lesson_23/lesson_23_seg_01.mp3"], consumed_23)
vo2_cues_23 = apply_overrides(23, transcriptions["lesson_23/lesson_23_seg_02.mp3"], consumed_23)

blocks_23 = [
    {
        "type": "voiceover",
        "audio_files": ["lesson_23/lesson_23_seg_01.mp3"],
        "total_audio_seconds": ACTUAL_DUR[23]["seg_01"],
        "timed_text": vo1_cues_23,
    },
    {
        "type": "prompt_cards",
        "ambient_audio": "ambient/ambient_music.mp3",
        "cards": [
            {
                "intro_hold_seconds": 0,
                "prompt": "Time frame and goal — five to ten years from now, what have you achieved? Write the specific goal and exactly when it happens.",
                "min_entry_seconds": 0
            },
            {
                "intro_hold_seconds": 0,
                "prompt": "The environment — describe exactly where you are. What do you see, smell, hear, taste, and observe around you? Build every detail.",
                "min_entry_seconds": 0
            },
            {
                "intro_hold_seconds": 0,
                "prompt": "The feeling — you've reached it. What are the specific emotions you feel knowing you accomplished this? Describe the pride, the satisfaction, the gratitude. Why is this moment significant to you specifically?",
                "min_entry_seconds": 0
            },
            {
                "intro_hold_seconds": 0,
                "prompt": "Rewind to today. One step. What is one single thing you can do today that moves the needle toward that moment?",
                "min_entry_seconds": 0
            },
        ],
        "summary": {"display": "all", "header": "", "hold_seconds": 0},
    },
    {
        "type": "voiceover",
        "audio_files": ["lesson_23/lesson_23_seg_02.mp3"],
        "total_audio_seconds": ACTUAL_DUR[23]["seg_02"],
        "timed_text": vo2_cues_23,
    },
]

# --- Day 30 ---
consumed_30 = set()
vo1_cues_30 = apply_overrides(30, transcriptions["lesson_30/lesson_30_seg_01.mp3"], consumed_30)
vo2_cues_30 = apply_overrides(30, transcriptions["lesson_30/lesson_30_seg_02.mp3"], consumed_30)

blocks_30 = [
    {
        "type": "voiceover",
        "audio_files": ["lesson_30/lesson_30_seg_01.mp3"],
        "total_audio_seconds": ACTUAL_DUR[30]["seg_01"],
        "timed_text": vo1_cues_30,
    },
    {
        "type": "prompt_cards",
        "ambient_audio": "ambient/ambient_music.mp3",
        "cards": [
            {
                "intro_hold_seconds": 0,
                "prompt": "Open your Day 23 journal entry — your five to ten year visualization. Read it. Let yourself feel it again.",
                "min_entry_seconds": 0
            },
            {
                "intro_hold_seconds": 0,
                "prompt": "Now open your evidence log. Read every entry from the beginning.",
                "min_entry_seconds": 0
            },
            {
                "intro_hold_seconds": 0,
                "prompt": "The distance between that visualization and where you stand right now? That's the work. And you've already started closing it.",
                "min_entry_seconds": 0
            },
            {
                "intro_hold_seconds": 0,
                "prompt": "What's next?",
                "min_entry_seconds": 0
            },
        ],
        "summary": {"display": "all", "header": "", "hold_seconds": 0},
    },
    {
        "type": "voiceover",
        "audio_files": ["lesson_30/lesson_30_seg_02.mp3"],
        "total_audio_seconds": ACTUAL_DUR[30]["seg_02"],
        "timed_text": vo2_cues_30,
    },
    {
        "type": "journal_prompt",
        "prompt": "What is different about the way you think about competing now compared to where you started? What does the next chapter look like — and what's your first move?"
    },
]

# ---------------------------------------------------------------------------
# Step 4 — Write JSON files
# ---------------------------------------------------------------------------
for day, blocks, cats, title in [
    (23, blocks_23, ["commitment"], "Your Visualization Board"),
    (30, blocks_30, ["mindfulness", "acceptance", "commitment"], "The Evidence"),
]:
    jpath = os.path.join(LESSON_DIR, f'lesson_{day:02d}.json')
    with open(jpath, encoding='utf-8') as f:
        data = json.load(f)
    data['blocks'] = blocks
    data['mac_categories'] = cats
    data['title'] = title
    data['duration_seconds'] = lesson_duration(blocks)
    with open(jpath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f"\nWrote lesson_{day:02d}.json  duration={data['duration_seconds']}s")

# ---------------------------------------------------------------------------
# Step 5 — Generate migration
# ---------------------------------------------------------------------------
sql_lines = [
    "-- Migration: corrected Days 23 and 30 content.",
    "-- Day 23: guided future visualization exercise (replaces visualization_board UI).",
    "-- Day 30: prompt_cards exercise (replaces program_completion); voiceover updated.",
    "-- Timed_text from Whisper base.en word-level; overrides applied for cues >100c.",
    "",
    "begin;",
    "",
]

for day, blocks, title in [
    (23, blocks_23, "Your Visualization Board"),
    (30, blocks_30, "The Evidence"),
]:
    dur = lesson_duration(blocks)
    cb  = json.dumps({'blocks': blocks}, ensure_ascii=False, separators=(',', ':'))
    uuid = UUID_FMT.format(day)
    sql_lines.append(f"-- Day {day}: {title}")
    sql_lines.append("update public.lessons set")
    sql_lines.append(f"  duration_seconds = {dur},")
    sql_lines.append(f"  content_blocks = '{sql_escape(cb)}'::jsonb,")
    sql_lines.append(f"  updated_at = now()")
    sql_lines.append(f"where id = '{uuid}';")
    sql_lines.append("")

sql_lines.append("commit;")

with open(OUT_MIG, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))
print(f"\nMigration written: {OUT_MIG}")

# ---------------------------------------------------------------------------
# Report any long timed_text cues
# ---------------------------------------------------------------------------
long = []
for day, cues_list in [(23, vo1_cues_23 + vo2_cues_23), (30, vo1_cues_30 + vo2_cues_30)]:
    for c in cues_list:
        if len(c['text']) > 75:
            long.append((day, c['start_s'], len(c['text']), c['text']))

if long:
    print(f"\n=== {len(long)} timed_text cue(s) over 75 chars — add OVERRIDES ===")
    for day, s, n, t in long:
        print(f"  (day={day}, start_s={s})  [{n}c]  {t[:90]}")
else:
    print("\nAll timed_text cues <= 75 chars.")
