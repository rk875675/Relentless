"""
Paraphrase timed_text cues > 80 chars to fit 2 mobile lines (~80 chars max).
start_s values are NOT changed.
Outputs:
  - Updated content/lessons/lesson_NN.json (Whisper-accurate timings + shortened text)
  - supabase/migrations/20260507200000_wod_days_15_30_two_line_cues.sql
"""

import json, os

LESSON_DIR = os.path.join(os.path.dirname(__file__), '..', 'content', 'lessons')
MIGS_DIR   = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations')
OUT_MIG    = os.path.join(MIGS_DIR, '20260507200000_wod_days_15_30_two_line_cues.sql')
UUID_FMT   = 'd0000000-0000-0000-0000-{:012d}'
MAX_CHARS  = 80

# Replacements keyed by (day, start_s).
# Values are the shortened on-screen text (<=80 chars).
# Whisper transcription errors are also corrected here.
REPLACEMENTS = {
    # -- Day 15 --
    (15, 0.0):    "Every time you use this anchor, you strengthen that connection.",

    # -- Day 16 --
    (16, 0.0):    "One of the most practical tools I've found in sports psychology.",
    (16, 33.26):  "Fatigue, frustration, pressure. Your focus is starting to drift.",
    (16, 45.66):  "Catch yourself here and you can course-correct before the spiral.",
    (16, 51.1):   "Red is where performance goes to die.",
    (16, 60.86):  "Once you're in the red, it takes real effort to come back.",
    (16, 70.9):   "The traffic light gives you a language for your own state.",
    (16, 77.27):  "On screen — define what each state looks and feels like for you.",

    # -- Day 17 --
    (17, 1.96):   "Before we go deeper into performance, I need to ask you something.",
    (17, 19.57):  "The people, the relationships — what your career is supposed to serve.",
    (17, 30.02):  "What he found at the highest level is this:",
    (17, 34.14):  "Those who burn out have lost their connection to their why.",
    (17, 53.04):  "The relationships, the character, the future — that's the point.",
    (17, 70.8):   "Compete for something bigger than the scoreboard.",
    (17, 85.15):  "The ones that matter most — no matter what happens in sport.",
    # seg_02
    (17, 0.0):    "That why is saved in your profile. Read it when it stops feeling worth it.",
    (17, 8.27):   "Read it when the training is hard and results aren't showing up.",
    (17, 14.51):  "The athletes who last never lose their connection to that answer.",

    # -- Day 18 --
    (18, 0.0):    "One of the biggest reasons athletes break: they've never planned for it.",
    (18, 6.48):   "Not the success — the worst case. What if you fall behind early?",
    (18, 13.65):  "What if you make a visible error in front of the biggest crowd?",
    (18, 18.37):  "What if your body gives out before it's over? Most athletes avoid this.",
    (18, 29.18):  "Planning for adversity makes you dangerous — response ready in advance.",
    (18, 33.98):  "The If-Then plan: if X happens, I do Y. Not pessimism — preparation.",
    (18, 42.3):   "Research is clear: athletes who pre-plan adversity recover faster.",
    (18, 49.47):  "They perform more consistently than athletes without a plan.",
    (18, 55.71):  "You're not hoping it won't happen. You're deciding it won't own you.",
    (18, 60.98):  "Build your If-Then plan for your three most likely adversity scenarios.",

    # -- Day 19 --
    (19, 0.0):    "That moment just became a rep.",
    (19, 6.06):   "Your brain already has a response. You've been there.",

    # -- Day 20 --
    (20, 2.46):   "I want to ask what the best coaches ask every athlete they work with.",
    (20, 12.08):  "The discomfort, the exhaustion of competing when your body has nothing left.",
    (20, 17.36):  "The psychological pain of being behind, being doubted.",
    (20, 44.62):  "You accept they're present — the fatigue, doubt, fear — and compete.",
    (20, 54.74):  "Champions aren't the ones who stopped feeling the pressure.",
    (20, 64.5):   "When the suffering arrives — and it will — the athlete who chose it",
    (20, 71.34):  "handles it completely differently than the one who's surprised.",

    # -- Day 21 (single merged voiceover) --
    (21, 0.0):    "Day 21. When you face a challenge, your brain does something automatic.",
    (21, 8.58):   "It imagines the worst case — embarrassment, failure, loss.",
    (21, 16.72):  "That's not weakness. That's your nervous system.",
    (21, 23.55):  "The threat response is ancient. It was built to keep you alive.",
    (21, 29.53):  "It still fires the same way at the starting line.",
    (21, 35.61):  "Two types of athletes in that moment: the victim and the fighter.",
    (21, 43.13):  "The victim becomes the fear. They make excuses. They shrink.",
    (21, 50.76):  "They find reasons they're not ready. They stay on the safe side.",
    (21, 56.81):  "The fighter acknowledges the fear — and steps over the line anyway.",
    (21, 64.12):  "The fear doesn't get to make the call. The difference isn't talent.",
    (21, 70.2):   "It's a decision made in the seconds before the whistle blows.",
    (21, 76.78):  "Who's in charge — you or the fear? You've been building this.",
    (21, 82.78):  "Today we name it. On screen — identify your line.",

    # -- Day 22 --
    (22, 0.0):    "Visualization is one of the highest-leverage tools in this program.",
    (22, 8.0):    "Mental imagery activates the same neural pathways as physical execution.",
    (22, 16.32):  "Your brain can't cleanly distinguish a vivid visualization from the real thing.",
    (22, 27.64):  "I build custom scripts for every athlete I coach one-on-one.",
    (22, 38.64):  "See yourself succeeding before you can execute the process.",
    (22, 45.67):  "The more sensory detail — sights, sounds, sensations — the more powerful.",
    (22, 53.67):  "Start with one breath, then close your eyes and build the scene.",

    # -- Day 23 --
    (23, 0.0):    "Commitment means directing your behavior toward your values. Every day.",
    (23, 10.34):  "The most powerful way to stay anchored: make your values visible.",
    (23, 16.46):  "Build a picture of the athlete you're committed to becoming.",
    (23, 24.54):  "When the brain is repeatedly exposed to a desired outcome,",
    (23, 30.06):  "it begins to prioritize opportunities that align with it.",
    (23, 47.35):  "Only works if it's real — not generic. Make it specific.",
    (23, 59.27):  "Canva, images, words — whatever it takes. Build something real.",

    # -- Day 25 --
    (25, 2.19):   "The five seconds after a mistake matter more than the mistake itself.",
    (25, 37.09):  "Interruption — not processing. You have one job: get back to the next play.",

    # -- Day 26 --
    (26, 7.3):    "You've added tools — reset word, If-Then plan, self-talk replacements.",
    (26, 42.49):  "You're showing your nervous system you have a trained answer now.",
    (26, 49.65):  "Every time you do this, that memory loses its charge.",
    (26, 58.69):  "Think of a moment that still stings. That's the one.",
    # seg_02
    (26, 0.0):    "That memory just became a rep.",
    (26, 5.52):   "The next time it arrives, you've already been there with a plan.",

    # -- Day 27 --
    (27, 0.0):    "Day 27. One question to carry for the rest of your career.",
    (27, 6.78):   "What's next. Not what did I achieve. What's next.",
    (27, 16.27):  "Complacency after success is one of the biggest performance killers.",
    (27, 40.27):  "Setting new limits the moment you reach the old ones.",
    (27, 44.91):  "Achievement is not a destination — it's a direction.",
    (27, 51.54):  "The athletes who last used each achievement as a launching pad.",
    (27, 56.98):  "You're three days from completing this program.",
    (27, 64.16):  "The most important thing: finishing is not the goal. The next chapter is.",
    (27, 70.4):   "On your screen — answer the question.",

    # -- Day 28 --
    (28, 0.0):    "Day 28. Who are you when it gets hard?",
    (28, 8.38):   "Behind in the fourth quarter, two mistakes back to back —",
    (28, 13.58):  "the biggest competition of your season on the line.",
    (28, 18.38):  "Think back to where you were when this journey started.",
    (28, 24.22):  "A version of you that defaulted to the situation. Got swallowed.",
    (28, 36.46):  "Mental training reveals you in the difficult moments.",
    (28, 42.38):  "Every rep has been preparing you for exactly that moment.",
    (28, 48.77):  "Write your competition identity — not a general statement.",
    (28, 57.76):  "The version of you when the game is on the line and everything hurts.",

    # -- Day 29 --
    (29, 13.09):  "A period in your career — a season, months — where everything was against you.",
    (29, 18.81):  "Injuries. A coaching change. Losing your position.",
    (29, 41.9):   "The ones who came out the other side didn't avoid the adversity.",
    # seg_02
    (29, 0.0):    "That adversity wasn't evidence against you. It was the training.",

    # -- Day 30 --
    (30, 0.02):   "Day 30. You made it. Most people quit around Day 8 or Day 15.",
    (30, 28.15):  "No visualization practice, no evidence log, no traffic light system.",
    (30, 34.79):  "No language for your head under pressure. No connection to your why.",
    (30, 48.82):  "The question to carry from here: What's next?",
    (30, 66.27):  "Take it into every season — every time you feel yourself plateauing.",
    (30, 78.68):  "Open your visualization board. Then read your evidence log.",
    # seg_02
    (30, 0.0):    "You don't need a score to know what changed.",
    (30, 4.51):   "How you showed up this week. How you handled the last competition.",
    (30, 10.83):  "How differently you talk to yourself now. That's the evidence.",
    (30, 25.09):  "When it gets hard — remember you've already been there.",
    (30, 29.65):  "You came out with a plan every single time.",
}

# Days where the same start_s (0.0) appears in BOTH vo1 and vo2
# — need to disambiguate by audio_file reference.
# For days 17, 18, 19, 20, 22, 23, 24, 25, 26, 27, 28, 29, 30:
# vo1 first block gets start_s=0.0 cue; vo2 second block gets its own start_s=0.0 cue.
# The REPLACEMENTS dict can't distinguish these purely by (day, start_s=0.0).
# We handle ambiguity by applying the replacement only to the FIRST matching cue found
# when iterating blocks in order. Since seg_01 always precedes seg_02, the first hit
# for start_s=0.0 goes to seg_01 and the second hit (if different text) to seg_02.
# Replacements above follow this ordering.

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

sql_lines = [
    "-- Migration: shorten timed_text cues >80 chars to fit 2 mobile lines.",
    "-- start_s values unchanged. Whisper transcription errors corrected where noted.",
    "",
    "begin;",
    "",
]

total_changed = 0

for day in range(15, 31):
    jpath = os.path.join(LESSON_DIR, f'lesson_{day:02d}.json')
    with open(jpath, encoding='utf-8') as f:
        data = json.load(f)

    # Track which (day, start_s) replacements have been consumed (for 0.0 ambiguity)
    consumed = {}
    changed = 0

    for block in data['blocks']:
        if block['type'] != 'voiceover':
            continue
        for cue in block['timed_text']:
            key = (day, cue['start_s'])
            new_text = REPLACEMENTS.get(key)
            too_long = len(cue['text']) > MAX_CHARS
            # Only apply replacement if this cue is actually over the limit
            # (avoids consuming the key on a short cue that shares start_s=0.0
            # with a later long cue in a different voiceover segment)
            if new_text and too_long and key not in consumed:
                cue['text'] = new_text
                consumed[key] = True
                changed += 1
            elif too_long and (not new_text or key in consumed):
                print(f"  UNHANDLED Day {day} [{cue['start_s']}s | {len(cue['text'])}c]: {cue['text'][:60]}...")

    total_changed += changed

    dur = lesson_duration(data['blocks'])
    data['duration_seconds'] = dur

    with open(jpath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    cb_json = json.dumps({'blocks': data['blocks']}, ensure_ascii=False, separators=(',', ':'))
    cb_sql  = sql_escape(cb_json)
    uuid    = UUID_FMT.format(day)

    sql_lines.append(f"-- Day {day}: {data['title']} ({changed} cue(s) shortened)")
    sql_lines.append("update public.lessons set")
    sql_lines.append(f"  duration_seconds = {dur},")
    sql_lines.append(f"  content_blocks = '{cb_sql}'::jsonb,")
    sql_lines.append(f"  updated_at = now()")
    sql_lines.append(f"where id = '{uuid}';")
    sql_lines.append("")

sql_lines.append("commit;")

with open(OUT_MIG, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))

print(f"Total cues shortened: {total_changed}")
print(f"Migration written: {OUT_MIG}")
