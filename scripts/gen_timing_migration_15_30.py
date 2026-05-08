"""
Generates supabase/migrations/20260507000000_wod_days_15_30_audio_timings.sql
Reads the lesson JSON files, scales timed_text start_s to actual MP3 durations,
and handles Day 21 (single seg_01 covers both voiceovers; no seg_02 file).
"""

import json
import os

# Actual durations (seconds) from mutagen
ACTUAL = {
    15: {'seg_01': 87.28, 'seg_02': 20.14},
    16: {'seg_01': 82.76, 'seg_02': 16.72},
    17: {'seg_01': 92.87, 'seg_02': 23.82},
    18: {'seg_01': 70.27, 'seg_02': 16.69},
    19: {'seg_01': 80.90, 'seg_02': 15.46},
    20: {'seg_01': 84.66, 'seg_02': 13.35},
    21: {'seg_01': 92.32},          # no seg_02
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

LESSON_DIR = os.path.join(os.path.dirname(__file__), '..', 'content', 'lessons')

UUID_FMT = 'd0000000-0000-0000-0000-{:012d}'

def scale_cues(cues, estimated, actual_dur):
    if estimated == 0:
        return cues
    scale = actual_dur / estimated
    return [dict(c, start_s=round(c['start_s'] * scale, 2)) for c in cues]

def sql_escape(s):
    return s.replace("'", "''")

def process_lesson(day):
    path = os.path.join(LESSON_DIR, f'lesson_{day:02d}.json')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)

    blocks = data['blocks']
    new_blocks = []
    vo_idx = 0  # which voiceover (1-based)

    for block in blocks:
        if block['type'] != 'voiceover':
            new_blocks.append(block)
            continue

        vo_idx += 1
        seg_key = f'seg_0{vo_idx}'

        # Day 21: skip vo2 (coach recorded everything in seg_01)
        if day == 21 and vo_idx == 2:
            continue

        if day == 21 and vo_idx == 1:
            # Merge both voiceovers into one block across actual duration 92.32s
            vo2_block = next((b for b in blocks if b['type'] == 'voiceover' and
                              b.get('audio_files', [''])[0].endswith('seg_02.mp3')), None)
            est_vo1 = block['total_audio_seconds']
            est_vo2 = vo2_block['total_audio_seconds'] if vo2_block else 25.0
            total_est = est_vo1 + est_vo2
            actual_dur = ACTUAL[21]['seg_01']

            # Scale vo1 cues
            merged = scale_cues(block['timed_text'], total_est, actual_dur)
            # Scale vo2 cues, offsetting by est_vo1
            if vo2_block:
                for c in vo2_block['timed_text']:
                    merged.append(dict(c, start_s=round((c['start_s'] + est_vo1) / total_est * actual_dur, 2)))
            merged.sort(key=lambda c: c['start_s'])

            new_block = {
                'type': 'voiceover',
                'audio_files': ['lesson_21/lesson_21_seg_01.mp3'],
                'total_audio_seconds': actual_dur,
                'timed_text': merged,
            }
            new_blocks.append(new_block)
            continue

        act_dur = ACTUAL[day].get(seg_key, block['total_audio_seconds'])
        est_dur = block['total_audio_seconds']
        new_cues = scale_cues(block['timed_text'], est_dur, act_dur)
        new_blocks.append(dict(block, total_audio_seconds=act_dur, timed_text=new_cues))

    data['blocks'] = new_blocks
    return data

def to_sql_jsonb(obj):
    """JSON-encode and escape apostrophes for SQL single-quoted string."""
    raw = json.dumps({'blocks': obj['blocks']}, ensure_ascii=False, separators=(',', ':'))
    return sql_escape(raw)

def lesson_duration(blocks):
    """Rough total duration from audio + fixed exercise estimates."""
    FIXED = {
        'prompt_cards': 25,  # per card estimate
        'timed_exercise': None,  # exact from duration_seconds
        'journal_prompt': 60,
        'visualization_board': 120,
        'program_completion': 120,
        'multi_field_entry': 45,
        'physiological_sigh': 60,
        'flash_cards': 15,  # per card
    }
    total = 0
    for b in blocks:
        t = b['type']
        if t == 'voiceover':
            total += b['total_audio_seconds']
        elif t == 'timed_exercise':
            total += b.get('duration_seconds', 0)
        elif t == 'prompt_cards':
            total += len(b.get('cards', [])) * FIXED['prompt_cards']
        elif t == 'journal_prompt':
            total += FIXED['journal_prompt']
        elif t == 'visualization_board':
            total += FIXED['visualization_board']
        elif t == 'program_completion':
            total += FIXED['program_completion']
        else:
            total += FIXED.get(t, 30)
    return int(total)

lines = [
    '-- Migration: update Days 15-30 voiceover timings with actual MP3 durations.',
    '-- total_audio_seconds replaced with measured values from mutagen.',
    '-- timed_text start_s scaled proportionally (refine later with Whisper pass).',
    '-- Day 21: lesson_21_seg_02 not delivered; both voiceovers merged into seg_01.',
    '',
    'begin;',
    '',
]

for day in range(15, 31):
    data = process_lesson(day)
    uuid = UUID_FMT.format(day)
    dur = lesson_duration(data['blocks'])
    cb = to_sql_jsonb(data)
    title = data['title']

    lines.append(f'-- Day {day}: {title}')
    lines.append(f"update public.lessons set")
    lines.append(f"  duration_seconds = {dur},")
    lines.append(f"  content_blocks = '{cb}'::jsonb,")
    lines.append(f"  updated_at = now()")
    lines.append(f"where id = '{uuid}';")
    lines.append('')

lines.append('commit;')

out_path = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations',
                         '20260507000000_wod_days_15_30_audio_timings.sql')
with open(out_path, 'w', encoding='utf-8') as f:
    f.write('\n'.join(lines))

print(f'Written: {out_path}')
for day in range(15, 31):
    data = process_lesson(day)
    dur = lesson_duration(data['blocks'])
    vo_blocks = [b for b in data['blocks'] if b['type'] == 'voiceover']
    segs = [f"{b['total_audio_seconds']}s" for b in vo_blocks]
    print(f"  Day {day}: duration={dur}s  vo_segs={segs}")
