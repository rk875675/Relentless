"""
Paraphrase all timed_text cues > 75 chars across Days 15-30.
Target: <= 75 chars per cue (3 lines max at ~25 chars/line on mobile).
start_s values are NOT changed.
Outputs updated JSON files + migration 20260507400000_wod_days_15_30_cue_length_fix.sql

Where two segments both have a long cue at start_s=0.0 (Day 15 only),
OVERRIDES stores a list; items are consumed in voiceover-block order.
"""

import json, os

LESSON_DIR = os.path.join(os.path.dirname(__file__), '..', 'content', 'lessons')
MIGS_DIR   = os.path.join(os.path.dirname(__file__), '..', 'supabase', 'migrations')
OUT_MIG    = os.path.join(MIGS_DIR, '20260507400000_wod_days_15_30_cue_length_fix.sql')
UUID_FMT   = 'd0000000-0000-0000-0000-{:012d}'
THRESHOLD  = 75   # only apply when cue exceeds this many chars

# ---------------------------------------------------------------------------
# OVERRIDES — minimal paraphrases keeping coach's voice and verbatim words.
# Values: str for unambiguous cases, list[str] for cues where seg_01 and
# seg_02 both have a long cue at the same start_s (Day 15 only).
# ---------------------------------------------------------------------------
OVERRIDES = {
    # -- Day 15 --
    # list: [seg_01 replacement, seg_02 replacement]
    (15, 0.0):   ["Day 15. Your focus anchor — the word your mind returns to when it drifts.",
                  "Every rep with that anchor strengthens the link to your focused state."],
    (15, 9.34):  "The most powerful anchor isn't just a word in your head — it's physical.",
    (15, 22.7):  "Elite athletes do this instinctively. They're trained focus triggers.",
    (15, 47.86): "The key is consistency — the same thing, the same way, every single time.",
    (15, 57.26): "Do it enough times in a focused state and it begins to trigger the state.",
    (15, 77.12): "Something always available in that space — that's your competition anchor.",

    # -- Day 16 --
    (16, 0.0):   "Day 16. One of the most practical tools in sports psychology.",
    (16, 33.16): "Fatigue, frustration, pressure — your focus is starting to drift.",
    (16, 45.46): "Catch yourself here — you can course correct before the spiral.",
    (16, 53.38): "Dominated by negative self-talk, poor decisions, emotional reactions.",
    (16, 60.8):  "Once you're in the red, it takes real effort to come back.",
    (16, 70.9):  "The traffic light: a language for your state and a plan for each.",
    (16, 76.72): "On screen — define what each state looks and feels like for you.",
    (16, 5.42):  "The goal: recognize amber before it becomes red, and have a tool ready.",  # seg_02

    # -- Day 17 --
    (17, 0.0):   "Day 17. Before we go deeper, I need to ask you something.",
    (17, 8.96):  "Not the athletic goals. Not the starting spot, stats, or scholarship.",
    (17, 19.56): "The people, the relationships, the responsibilities it's supposed to serve.",
    (17, 29.9):  "Those who burn out have lost their connection to their why.",
    (17, 52.68): "The relationships, the character, the future it creates — that's the point.",
    (17, 59.86): "Family, friends, health, academics — the people counting on you.",
    (17, 70.36): "Compete for something bigger than the scoreboard — you're tougher to break.",
    (17, 85.04): "On your screen — name your first things. The ones that matter most.",

    # -- Day 18 --
    (18, 1.56):  "The biggest reason athletes break: they've never planned for the worst.",
    (18, 13.2):  "What if you make a visible error in front of the biggest crowd ever?",
    (18, 18.1):  "What if your body gives out before the competition is over?",
    (18, 28.96): "Planning for adversity makes you dangerous — response ready in advance.",
    (18, 46.56): "Pre-planning adversity: you recover faster and perform more consistently.",
    (18, 62.48): "On screen — build your If-Then plan for three likely adversity scenarios.",

    # -- Day 19 --
    (19, 3.56):  "There's a moment in your career where your mind completely broke on you.",
    (19, 37.9):  "Accept the mistakes, learn from them, and refuse to let them define you.",
    (19, 60.56): "Your brain will look for the trained response — not the old pattern.",
    (19, 2.94):  "The next time something like that arrives, your brain has a response.",  # seg_02

    # -- Day 20 --
    (20, 2.38):  "The question the best coaches ask every athlete they work with.",
    (20, 12.12): "The discomfort, the exhaustion, the psychological pain of being doubted.",
    (20, 44.04): "You accept they're present — fatigue, doubt, fear — and compete with them.",
    (20, 53.8):  "Champions aren't the ones who stopped feeling the pressure.",
    (20, 61.62): "Face that question directly — not to inspire you, to prepare you.",
    (20, 67.62): "The athlete who chose the suffering handles it completely differently.",
    (20, 0.0):   "Those three answers are your contract with yourself.",  # seg_02

    # -- Day 21 --
    (21, 12.42): "It imagines the worst case — failure, loss, the fear scenario.",
    (21, 30.74): "It fires the same way — facing a predator or stepping to the starting line.",
    (21, 63.5):  "They've decided the fear doesn't get to make the call.",
    (21, 74.28): "A decision made in seconds: who's in charge — you or the fear?",
    (21, 86.82): "On screen — identify your line and declare which side you choose.",

    # -- Day 22 --
    (22, 0.0):   "Today: visualization. One of the highest-leverage tools in this program.",
    (22, 8.66):  "Mental imagery activates the same neural pathways as physical execution.",
    (22, 16.92): "Your brain can't distinguish a vivid visualization from the real thing.",
    (22, 45.86): "Sights, sounds, sensations — the more sensory detail, the more powerful.",
    (22, 53.68): "Start with one breath — then close your eyes and build the scene.",

    # -- Day 23 --
    (23, 0.0):   "Day 23. Commitment: directing your behavior toward your values, every day.",
    (23, 9.82):  "The most powerful way to stay anchored to your values: make them visible.",
    (23, 16.42): "Build a picture of the athlete you're becoming — see it every day.",
    (23, 23.72): "Repeated exposure to a desired image changes what the brain prioritizes.",
    (23, 46.4):  "This only works if it's real — specific goals, your why, your identity.",
    (23, 59.24): "Use Canva, use images, use words — build something that pulls you.",

    # -- Day 24 --
    (24, 4.64):  "Perfection is one of the most damaging standards to chase.",
    (24, 36.7):  "If your worst performance is at 60% of capability — that's your floor.",
    (24, 44.44): "Athletes who compound commit to fundamentals until their floor rises.",
    (24, 63.96): "Compounding happens through daily behaviors, not heroic game day efforts.",
    (24, 70.86): "The routine, the evidence log, the reps you build when nobody's watching.",
    (24, 81.58): "On screen — look at your current floor and commit to raising it.",

    # -- Day 25 --
    (25, 2.1):   "The five seconds after a mistake matter more than the mistake itself.",
    (25, 57.04): "Drill that sequence three times back to back until it's locked.",

    # -- Day 26 --
    (26, 7.54):  "You've added tools — reset word, If-Then plan, self-talk replacements.",
    (26, 23.64): "One you've carried as a failure — where your mind got in the way.",
    (26, 42.74): "You're showing your nervous system: there's a trained answer now.",
    (26, 53.92): "Next time it arrives, your brain looks for the trained response.",
    (26, 0.0):   "That memory just became a rep. You've already been there with a plan.",  # seg_02

    # -- Day 27 --
    (27, 1.96):  "One question to carry for the rest of your career.",
    (27, 15.56): "One of the biggest performance killers in sport: complacency after success.",
    (27, 21.2):  "You make the team, hit a personal best — and your standards quietly drop.",
    (27, 37.08): "Continuous growth — setting new limits the moment you reach the old ones.",
    (27, 48.08): "Sustaining elite performance: never satisfied with what you built.",
    (27, 55.7):  "They used each achievement as a launching pad for the next standard.",
    (27, 62.02): "Three days from completing this. Here's the most important thing:",

    # -- Day 28 --
    (28, 4.6):   "Who are you behind, two mistakes back to back, with everything on the line?",
    (28, 23.34): "There was probably a version of you with no answer for that question.",
    (28, 43.68): "Every rep preparing you for that moment — the one that used to break you.",
    (28, 57.88): "The version of you when everything is on the line and against you.",

    # -- Day 29 --
    (29, 10.88): "A period in your career where it felt like everything was against you.",
    (29, 41.76): "They didn't avoid the adversity — they extracted from it.",
    (29, 63.5):  "Your hardest stretch — not to relive it. To extract what it built.",
    (29, 3.36):  "It was the training — now in your evidence log. Not history. Ammunition.",  # seg_02

    # -- Day 30 --
    (30, 0.0):   "Day 30. You made it. Most people quit at Day 8 or 15 — you didn't.",
    (30, 22.08): "No reset word, no If-Then plan, no evidence log, no traffic light system.",
    (30, 42.84): "Not because someone gave it to you — you built it, rep by rep, day by day.",
    (30, 50.74): "The question to carry from here: What's next?",
    (30, 66.6):  "Take it into every season, every competition, every time you plateau.",
    (30, 76.74): "Open your visualization board. Look at who you committed to becoming.",
    (30, 2.74):  "You know it in how you showed up, how you handled the last competition.",  # seg_02
    (30, 17.0):  "Keep the log, run the routine, use the tools, and build on your why.",
    (30, 25.12): "When it gets hard, you've been here before and came out with a plan.",
}


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
    "-- Migration: shorten all timed_text cues > 75 chars across Days 15-30.",
    "-- Targets <=75 chars per cue (~3 lines max at 25 chars/line on mobile).",
    "-- start_s values unchanged. Coach voice kept verbatim where possible.",
    "",
    "begin;",
    "",
]

total_fixed = 0
still_long  = []

for day in range(15, 31):
    jpath = os.path.join(LESSON_DIR, f'lesson_{day:02d}.json')
    with open(jpath, encoding='utf-8') as f:
        data = json.load(f)

    # Track list-style overrides: how many times each key has been consumed
    list_consumed = {}
    fixed_this_day = 0

    for block in data['blocks']:
        if block['type'] != 'voiceover':
            continue
        for cue in block['timed_text']:
            if len(cue['text']) <= THRESHOLD:
                continue

            key = (day, cue['start_s'])
            override = OVERRIDES.get(key)
            if override is None:
                still_long.append((day, cue['start_s'], len(cue['text']), cue['text']))
                continue

            if isinstance(override, list):
                idx = list_consumed.get(key, 0)
                if idx < len(override):
                    cue['text'] = override[idx]
                    list_consumed[key] = idx + 1
                    fixed_this_day += 1
                else:
                    still_long.append((day, cue['start_s'], len(cue['text']), cue['text']))
            else:
                cue['text'] = override
                fixed_this_day += 1

    total_fixed += fixed_this_day
    dur = lesson_duration(data['blocks'])
    data['duration_seconds'] = dur

    with open(jpath, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    cb_json = json.dumps({'blocks': data['blocks']}, ensure_ascii=False, separators=(',', ':'))
    cb_sql  = sql_escape(cb_json)
    uuid    = UUID_FMT.format(day)

    sql_lines.append(f"-- Day {day}: {data['title']} ({fixed_this_day} cue(s) shortened)")
    sql_lines.append("update public.lessons set")
    sql_lines.append(f"  duration_seconds = {dur},")
    sql_lines.append(f"  content_blocks = '{cb_sql}'::jsonb,")
    sql_lines.append(f"  updated_at = now()")
    sql_lines.append(f"where id = '{uuid}';")
    sql_lines.append("")

sql_lines.append("commit;")

with open(OUT_MIG, 'w', encoding='utf-8') as f:
    f.write('\n'.join(sql_lines))

print(f"Fixed {total_fixed} cue(s). Migration written: {OUT_MIG}")

if still_long:
    print(f"\n=== {len(still_long)} unhandled long cue(s) — add to OVERRIDES ===")
    for day, s, n, t in still_long:
        print(f"  (day={day}, start_s={s})  [{n}c]  {t[:80]}")
else:
    print("No unhandled long cues remaining.")
