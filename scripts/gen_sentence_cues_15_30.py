"""
Re-generate Days 15-30 timed_text using faster-whisper base.en with word-level timestamps.

Algorithm:
  - Get every word's start/end time and text.
  - Accumulate words into a cue until the accumulated text ends with sentence-closing
    punctuation (. ? !), OR a silence gap of >= GAP_THRESHOLD seconds is detected
    between consecutive words.
  - Use the start time of the first word in the group as cue start_s.
  - Strip leading/trailing whitespace and capitalise first letter.
  - After all cues are generated, print any cue > MAX_CHARS so they can be reviewed
    and added to OVERRIDES for minimal manual paraphrase.

OVERRIDES dict:
  Key = (day, round(start_s, 2))
  Value = replacement text (minimal paraphrase, verbatim words kept where possible)

Outputs:
  - Updated content/lessons/lesson_NN.json for N in 15..30
  - supabase/migrations/20260507300000_wod_days_15_30_sentence_cues.sql
"""

import json
import os
import sys

from faster_whisper import WhisperModel
from mutagen.mp3 import MP3

AUDIO_DIR  = r"C:\Users\rkuma\Downloads\RELENTLESS\CONTENT\Grant 015-030"
LESSON_DIR = os.path.join(os.path.dirname(__file__), '..', 'content', 'lessons')
MIGS_DIR   = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations')
OUT_MIG    = os.path.join(MIGS_DIR, '20260507300000_wod_days_15_30_sentence_cues.sql')

UUID_FMT   = 'd0000000-0000-0000-0000-{:012d}'
GAP_THRESHOLD = 1.2   # seconds of silence -> force a new cue
MAX_CHARS     = 120   # flag for manual review (not a hard cutoff)

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

# ---------------------------------------------------------------------------
# OVERRIDES: minimal paraphrases for cues that are still too long after
# sentence grouping. Keyed by (day, start_s rounded to 2dp).
# Only applied to cues that are genuinely long (>OVERRIDE_THRESHOLD chars) so
# that a short cue sharing the same start_s in a different voiceover segment
# is never accidentally replaced.
# ---------------------------------------------------------------------------
OVERRIDE_THRESHOLD = 100  # only apply override when existing cue exceeds this

OVERRIDES = {
    # -- Day 15 --
    # "May 15" is a Whisper error for "Day 15"; cue also doubles two sentences
    (15, 0.0):    "Day 15. You chose your focus anchor — a word or phrase your mind returns to when it starts to drift.",
    # Multiple examples merged into one very long sentence
    (15, 9.34):   "Today I want to take that further — the most powerful version of an anchor isn't just a word in your head.",
    (15, 22.7):   "Elite athletes do this instinctively. These aren't superstitions — they're trained focus triggers.",

    # -- Day 17 --
    (17, 29.9):   "What Beswick found: those who burn out or lose motivation have lost their connection to their why.",
    # "Family, friends..." list runs too long
    (17, 59.86):  "Family. Friends. Health. Academics. The people counting on you — and the version of yourself you're building.",
    (17, 70.36):  "Compete for something bigger than the scoreboard and you're tougher to break.",
    # Whisper stutter ("whether you have ever, the ones that matter..."); fix and trim
    (17, 85.04):  "On your screen — name your first things. The ones that matter most no matter what happens.",
    # seg_02: long run-on with trailing fragment "After you"
    (17, 11.54):  "The athletes who last never lose their connection to that answer.",

    # -- Day 18 --
    (18, 46.56):  "Athletes who pre-plan adversity responses recover faster and perform more consistently.",

    # -- Day 20 --
    (20, 12.12):  "The discomfort of hard training, competing with nothing left, the psychological pain of being doubted.",
    (20, 44.04):  "You accept they're present — the fatigue, the doubt, the fear — and compete alongside them.",
    (20, 67.62):  "The athlete who already chose the suffering handles it completely differently.",
    # seg_02: "not with your coaches, not with your team" appendage pushes it over
    (20, 0.0):    "Those three answers are your commitment contract with yourself — not your coaches, not your team.",

    # -- Day 21 (single merged voiceover) --
    (21, 0.0):    "Day 21. When you face a challenge, your brain does something automatic.",

    # -- Day 22 --
    (22, 27.34):  "I build custom visualization scripts for every athlete I coach one-on-one.",
    (22, 39.0):   "You need to see yourself succeeding before you can execute the process.",

    # -- Day 23 --
    (23, 16.42):  "Build a picture of the athlete you're committed to becoming — somewhere you see it every day.",
    (23, 23.72):  "Research on visual goals: repeated exposure to a desired outcome changes what the brain prioritizes.",
    (23, 46.4):   "This only works if it's real — specific goals, your why, your identity, the life you're building.",
    (23, 59.24):  "Use Canva, use images, use words — build something that, when you look at it, you feel the pull of it.",

    # -- Day 24 --
    (24, 4.64):   "Perfection is one of the most damaging standards to chase — that gap between best and baseline becomes shame.",
    (24, 44.44):  "The athletes who compound over time commit to fundamentals so consistently that their floor rises.",

    # -- Day 26 (seg_02) --
    (26, 0.0):    "That memory just became a rep. The next time something like it arrives, you've already been there with a plan.",

    # -- Day 27 --
    (27, 21.2):   "You make the team, hit a personal best — and without realizing it, your standards quietly drop.",
    (27, 37.08):  "It builds the mindset of continuous growth — setting new limits the moment you reach the old ones.",
    (27, 48.08):  "The athletes who sustain elite performance are not the ones who were satisfied with what they built.",

    # -- Day 28 --
    # Multiple clauses in one sentence; keep the core question
    (28, 4.6):    "Who are you when you're behind, two mistakes back to back, the biggest competition of your season on the line?",

    # -- Day 29 --
    # Very long opening sentence in seg_01
    (29, 10.88):  "Today I want you to think bigger — a period in your career where it felt like everything was working against you.",
    (29, 41.76):  "The ones who came out the other side at a higher level didn't avoid adversity — they extracted from it.",
    # seg_02: Whisper error ("it's your in your") + run-on; correct and tighten
    (29, 3.36):   "It was the training. It's in your evidence log now — not history. Ammunition.",

    # -- Day 30 --
    # "I want to gloss over that" is a Whisper error for "I don't want to gloss over that"
    (30, 0.0):    "Day 30. You made it. Most people quit around Day 8 or 15 when it starts feeling like work — you didn't.",
    # Very long list of "no X, no Y..." items
    (30, 22.08):  "No reset word, no If-Then plan, no evidence log, no traffic light system, no connection to your why.",
    (30, 50.74):  "The question I want you to carry from here — the one that keeps athletes growing. What's next?",
    (30, 76.74):  "Open your visualization board — look at the athlete you committed to becoming. Then read your evidence log.",
    # seg_02: long run-on list
    (30, 2.74):   "You know it in how you showed up, how you handled the last competition, how differently you talk to yourself now.",
    (30, 25.12):  "When competition gets hard, remember you've already been here and came out with a plan every single time.",
}


def find_local(seg_name):
    import glob
    lower = seg_name.lower()
    caps  = seg_name[:-4] + '.MP3'
    for name in [lower, caps, seg_name]:
        p = os.path.join(AUDIO_DIR, name)
        if os.path.exists(p):
            return p
    matches = glob.glob(os.path.join(AUDIO_DIR, seg_name[:-4] + '.*'))
    if matches:
        return matches[0]
    raise FileNotFoundError(f"No local audio for {seg_name}")


def ends_sentence(word_text):
    """True if this word ends a sentence (ends with . ? !)."""
    t = word_text.rstrip()
    return t.endswith('.') or t.endswith('?') or t.endswith('!')


def words_to_cues(words):
    """
    Group a flat list of word dicts {start, end, word} into cues.
    Each cue = {'start_s': float, 'text': str}.
    Breaks at sentence-ending punctuation OR silence gap >= GAP_THRESHOLD.
    """
    cues = []
    buf_words = []

    for i, w in enumerate(words):
        buf_words.append(w)
        text_so_far = ' '.join(x['word'].strip() for x in buf_words).strip()

        # Decide whether to commit this cue
        commit = False
        reason = ''

        if ends_sentence(w['word']):
            commit = True
            reason = 'sentence_end'
        elif i + 1 < len(words):
            gap = words[i + 1]['start'] - w['end']
            if gap >= GAP_THRESHOLD:
                commit = True
                reason = f'gap_{gap:.2f}s'

        if commit:
            start_s = round(buf_words[0]['start'], 2)
            text = ' '.join(x['word'].strip() for x in buf_words).strip()
            # Capitalise first letter
            if text:
                text = text[0].upper() + text[1:]
            cues.append({'start_s': start_s, 'text': text, '_reason': reason})
            buf_words = []

    # Flush any remaining words
    if buf_words:
        start_s = round(buf_words[0]['start'], 2)
        text = ' '.join(x['word'].strip() for x in buf_words).strip()
        if text:
            text = text[0].upper() + text[1:]
        cues.append({'start_s': start_s, 'text': text, '_reason': 'flush'})

    return cues


def transcribe_to_cues(model, local_path):
    """Return sentence-grouped cues from the audio file."""
    segments, _info = model.transcribe(
        local_path,
        word_timestamps=True,
        language='en',
        beam_size=5,
        vad_filter=False,   # disable VAD — we handle grouping ourselves
    )
    all_words = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                all_words.append({'start': w.start, 'end': w.end, 'word': w.word})

    cues = words_to_cues(all_words)
    # Strip internal _reason key before returning
    return [{'start_s': c['start_s'], 'text': c['text']} for c in cues]


def apply_overrides(day, cues, consumed):
    """
    Apply OVERRIDES replacements for the given day.
    Only applies to cues that exceed OVERRIDE_THRESHOLD chars, so a short cue
    that shares start_s=0.0 (or any other time) with a long cue in a different
    voiceover segment is never accidentally replaced.
    `consumed` is a shared set across all voiceover blocks of the same lesson
    to prevent double-application.
    """
    for cue in cues:
        key = (day, cue['start_s'])
        if key in OVERRIDES and len(cue['text']) > OVERRIDE_THRESHOLD and key not in consumed:
            cue['text'] = OVERRIDES[key]
            consumed.add(key)
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
print("Loading faster-whisper base.en model...", flush=True)
model = WhisperModel("base.en", device="cpu", compute_type="int8")
print("Model loaded.\n", flush=True)

long_cues_found = []

sql_lines = [
    "-- Migration: Days 15-30 timed_text regenerated with word-level Whisper base.en.",
    "-- Each cue = complete sentence or natural clause; start_s = first word timestamp.",
    "-- Replaces all previous timed_text migrations for days 15-30.",
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
    consumed_overrides = set()   # shared across all voiceover blocks of this lesson

    for block in data['blocks']:
        if block['type'] != 'voiceover':
            new_blocks.append(block)
            continue

        vo_idx += 1
        seg_key = f'seg_0{vo_idx}'

        # Day 21 has only seg_01 (merged voiceover); skip any second block
        if day == 21 and vo_idx == 2:
            continue

        audio_ref  = block['audio_files'][0]          # "lesson_XX/lesson_XX_seg_YY.mp3"
        seg_name   = os.path.basename(audio_ref)
        local      = find_local(seg_name)
        actual_dur = ACTUAL_DUR[day][seg_key]

        print(f"  [{seg_key}] {os.path.basename(local)} ...", flush=True)
        cues = transcribe_to_cues(model, local)
        cues = apply_overrides(day, cues, consumed_overrides)
        print(f"         -> {len(cues)} sentence cue(s)", flush=True)

        for c in cues:
            if len(c['text']) > MAX_CHARS:
                long_cues_found.append((day, c['start_s'], len(c['text']), c['text']))

        new_block = dict(block)
        new_block['total_audio_seconds'] = actual_dur
        new_block['timed_text'] = cues
        new_blocks.append(new_block)

    data['blocks'] = new_blocks
    dur = lesson_duration(new_blocks)
    data['duration_seconds'] = dur

    with open(jpath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

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

print(f"\nMigration written: {OUT_MIG}")

if long_cues_found:
    print(f"\n=== {len(long_cues_found)} cue(s) over {MAX_CHARS} chars — add OVERRIDES for these ===")
    for day, s, n, t in long_cues_found:
        print(f"  (day={day}, start_s={s})  [{n}c]  {t[:110]}")
else:
    print(f"\nAll cues are <= {MAX_CHARS} chars. No overrides needed.")
