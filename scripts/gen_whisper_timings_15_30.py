"""
Run faster-whisper on Days 15-30 audio files to produce accurate timed_text start_s values.
Outputs:
  - Updated content/lessons/lesson_15.json .. lesson_30.json
  - supabase/migrations/20260507100000_wod_days_15_30_whisper_timings.sql

Day 21 note: only lesson_21_seg_01.mp3 exists (coach recorded both voiceovers as one file).
The lesson JSON/DB has a single merged voiceover block pointing to seg_01.
"""

import json
import os
import re
import sys

from faster_whisper import WhisperModel
from mutagen.mp3 import MP3

AUDIO_DIR   = r"C:\Users\rkuma\Downloads\RELENTLESS\CONTENT\Grant 015-030"
LESSON_DIR  = os.path.join(os.path.dirname(__file__), '..', 'content', 'lessons')
MIGS_DIR    = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations')
OUT_MIG     = os.path.join(MIGS_DIR, '20260507100000_wod_days_15_30_whisper_timings.sql')

ACTUAL_DUR = {
    15: {'seg_01': 87.28, 'seg_02': 20.14},
    16: {'seg_01': 82.76, 'seg_02': 16.72},
    17: {'seg_01': 92.87, 'seg_02': 23.82},
    18: {'seg_01': 70.27, 'seg_02': 16.69},
    19: {'seg_01': 80.90, 'seg_02': 15.46},
    20: {'seg_01': 84.66, 'seg_02': 13.35},
    21: {'seg_01': 92.32},
    22: {'seg_01': 59.61, 'seg_02': 19.70},
    23: {'seg_01': 76.98, 'seg_02': 18.18},
    24: {'seg_01': 86.10, 'seg_02': 10.74},
    25: {'seg_01': 65.55, 'seg_02': 13.93},
    26: {'seg_01': 69.18, 'seg_02': 12.94},
    27: {'seg_01': 77.38, 'seg_02': 14.06},
    28: {'seg_01': 67.30, 'seg_02': 13.69},
    29: {'seg_01': 75.11, 'seg_02': 14.35},
    30: {'seg_01': 86.91, 'seg_02': 41.78},
}

UUID_FMT = 'd0000000-0000-0000-0000-{:012d}'

def find_local(seg_name):
    """Return local path for seg_name (e.g. 'lesson_15_seg_01.mp3'), case-insensitive."""
    lower = seg_name.lower()
    upper = seg_name.upper().replace('.MP3', '.MP3')
    caps  = seg_name[:-4] + '.MP3'  # .MP3 uppercase ext
    for name in [lower, caps, seg_name]:
        p = os.path.join(AUDIO_DIR, name)
        if os.path.exists(p):
            return p
    # glob fallback
    import glob
    matches = glob.glob(os.path.join(AUDIO_DIR, seg_name[:-4] + '.*'))
    if matches:
        return matches[0]
    raise FileNotFoundError(f"No local audio found for {seg_name}")

def transcribe(model, local_path):
    """Return list of {"start_s": float, "text": str} from faster_whisper segments."""
    segments, _info = model.transcribe(
        local_path,
        beam_size=5,
        language="en",
        vad_filter=True,
        vad_parameters={"min_silence_duration_ms": 300},
    )
    cues = []
    for seg in segments:
        text = seg.text.strip()
        if text:
            cues.append({"start_s": round(seg.start, 2), "text": text})
    return cues

def sql_escape(s):
    return s.replace("'", "''")

def lesson_duration(blocks):
    total = 0
    for b in blocks:
        t = b['type']
        if t == 'voiceover':
            total += b['total_audio_seconds']
        elif t == 'timed_exercise':
            total += b.get('duration_seconds', 0)
        elif t == 'prompt_cards':
            total += len(b.get('cards', [])) * 25
        elif t == 'journal_prompt':
            total += 60
        elif t in ('visualization_board', 'program_completion'):
            total += 120
        else:
            total += 30
    return int(total)

# ---------- load model ----------
print("Loading faster-whisper tiny.en model...", flush=True)
model = WhisperModel("tiny.en", device="cpu", compute_type="int8")
print("Model loaded.\n", flush=True)

sql_lines = [
    "-- Migration: Days 15-30 voiceover timed_text from faster-whisper tiny.en.",
    "-- Replaces proportionally-scaled placeholders with actual speech timestamps.",
    "",
    "begin;",
    "",
]

for day in range(15, 31):
    print(f"Day {day}...", flush=True)
    jpath = os.path.join(LESSON_DIR, f'lesson_{day:02d}.json')
    with open(jpath, encoding='utf-8') as f:
        data = json.load(f)

    vo_idx = 0
    new_blocks = []

    for block in data['blocks']:
        if block['type'] != 'voiceover':
            new_blocks.append(block)
            continue

        vo_idx += 1
        seg_key = f'seg_0{vo_idx}'

        # Day 21: only seg_01 exists; skip any second voiceover in the JSON
        if day == 21 and vo_idx == 2:
            # The JSON still has the original two-block structure;
            # the DB has a merged single block from the timing migration.
            # Skip this block — the merged block is already written as vo_idx==1.
            continue

        audio_ref = block['audio_files'][0]            # "lesson_XX/lesson_XX_seg_YY.mp3"
        seg_name  = os.path.basename(audio_ref)        # "lesson_XX_seg_YY.mp3"
        local     = find_local(seg_name)
        actual_dur = ACTUAL_DUR[day][seg_key]

        print(f"  [{seg_key}] {os.path.basename(local)} ({actual_dur}s) ...", flush=True)
        cues = transcribe(model, local)
        print(f"         -> {len(cues)} cue(s)", flush=True)

        if day == 21 and vo_idx == 1:
            # In the DB this block covers the full 92.32s (merged); update accordingly
            pass  # cues already span the full file

        new_block = dict(block)
        new_block['total_audio_seconds'] = actual_dur
        new_block['timed_text'] = cues
        new_blocks.append(new_block)

    data['blocks'] = new_blocks
    dur = lesson_duration(new_blocks)
    data['duration_seconds'] = dur

    # Write updated JSON
    with open(jpath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    # Build SQL
    cb_json = json.dumps({'blocks': new_blocks}, ensure_ascii=False, separators=(',', ':'))
    cb_sql  = sql_escape(cb_json)
    uuid    = UUID_FMT.format(day)

    sql_lines.append(f"-- Day {day}: {data['title']}")
    sql_lines.append("update public.lessons set")
    sql_lines.append(f"  duration_seconds = {dur},")
    sql_lines.append(f"  content_blocks = '{cb_sql}'::jsonb,")
    sql_lines.append(f"  updated_at = now()")
    sql_lines.append(f"where id = '{uuid}';")
    sql_lines.append("")

sql_lines.append("commit;")

with open(OUT_MIG, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))

print(f"\nDone. Migration written to:\n  {OUT_MIG}")
