#!/usr/bin/env python3
"""
Generate the WOD Days 8-14 migration with Whisper-aligned voiceover timings.

Usage:
  python scripts/voiceover_align/run_wod_days_8_14_align.py --model base
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_ALIGN_DIR = Path(__file__).resolve().parent
if str(_ALIGN_DIR) not in sys.path:
    sys.path.insert(0, str(_ALIGN_DIR))

from align_voiceover import (  # noqa: E402
    align_cues,
    collect_words_faster_whisper,
    ffprobe_duration_seconds,
    spread_tail_duplicate_starts,
)

COACH_ID = "a0000000-0000-0000-0000-000000000001"
AMBIENT = "ambient/ambient_music.mp3"


def voiceover(day: int, seg: int, cues: list[str]) -> dict:
    return {
        "type": "voiceover",
        "audio_files": [f"lesson_{day:02d}/lesson_{day:02d}_seg_{seg:02d}.mp3"],
        "total_audio_seconds": 1.0,
        "timed_text": [{"start_s": 0.0, "text": cue} for cue in cues],
    }


LESSONS: list[dict] = [
    {
        "day": 8,
        "id": "d0000000-0000-0000-0000-000000000008",
        "title": "Why You're Better in Practice Than Games",
        "categories": ["mindfulness"],
        "blocks": [
            voiceover(8, 1, [
                "Day 8.",
                "Every athlete I've coached has dealt with this.",
                "You're better in practice than you are in games.",
                "And it's not a physical problem.",
                "It's not a technique problem.",
                "But in practice, your brain actually just trusts your body.",
                "It lets your training just run.",
                "You play free.",
                "The game starts: mechanics, scoreboard, mistakes, coach.",
                "And your body is the same, but your brain is somewhere else.",
                "So I played quarterback at the D1 level and I know exactly what this feels like.",
                "That pressure gap is what we're here to close.",
                "So today, I want you to name your version of it.",
                "On your screen, you're going to see two prompts.",
                "And I want you to think about a real competition and get specific.",
                "Take your time.",
            ]),
            {
                "type": "prompt_cards",
                "ambient_audio": AMBIENT,
                "cards": [
                    {
                        "intro_hold_seconds": 0,
                        "prompt": "Think about your last competition. At what exact moment did your focus shift away from execution and toward something you couldn't control?",
                        "min_entry_seconds": 0,
                    },
                    {
                        "intro_hold_seconds": 0,
                        "prompt": "What was your brain doing instead of competing?",
                        "min_entry_seconds": 0,
                    },
                ],
                "summary": {"display": "all", "header": "", "hold_seconds": 0},
            },
            voiceover(8, 2, [
                "What you just named is your pattern.",
                "Most athletes never identify it.",
                "You just did.",
                "That's where the work starts.",
                "Go hit the journal.",
                "After you finish — Day 8 is complete.",
            ]),
            {
                "type": "journal_prompt",
                "prompt": "What's the difference between how you feel mentally in practice versus competition? When does the shift happen?",
            },
        ],
    },
    {
        "day": 9,
        "id": "d0000000-0000-0000-0000-000000000009",
        "title": "The 30-Second Reset",
        "categories": ["mindfulness", "acceptance"],
        "blocks": [
            voiceover(9, 1, [
                "Day 9.",
                "One of the first things I build with every athlete I coach is a reset.",
                "Not a pep talk.",
                "Not five minutes of deep breathing.",
                "Your reset gets you back after mistakes, calls, or mental spirals.",
                "You are going to make mistakes in competition.",
                "The question is what happens in the five seconds after.",
                "Because that's where the spiral starts.",
                "One bad play becomes two.",
                "Two becomes a bad half.",
                "The reset has three steps.",
                "One breath.",
                "One physical cue.",
                "One word.",
                "The breath interrupts the stress response.",
                "The physical cue breaks tension in your body.",
                "The word brings your attention back to the present moment.",
                "Today you're building yours.",
                "You'll fill in three fields: breath, cue, and word.",
                "Fill each one in.",
                "This becomes your protocol.",
            ]),
            {
                "type": "multi_field_entry",
                "ambient_audio": AMBIENT,
                "header": "Build Your 30-Second Reset",
                "fields": [
                    {
                        "label": "Your breath — one box breath. 4 seconds in, hold 4, out 4, hold 4. This is your default.",
                        "input": False,
                    },
                    {
                        "label": "Your physical cue — what movement signals the reset? (Ex: shake out your hands, tap your wrist, roll your shoulders)",
                        "input": True,
                    },
                    {
                        "label": "Your word — one word that brings you back to the present moment.",
                        "input": True,
                    },
                ],
                "submit_label": "Save",
                "summary_header": "Build Your 30-Second Reset",
                "continue_label": "Continue",
            },
            voiceover(9, 2, [
                "That sequence is yours now.",
                "Drill it in practice this week — intentionally.",
                "Make a mistake on purpose and run the reset.",
                "That's how it becomes automatic.",
                "The goal is to make it so trained your nervous system just does it.",
                "Without deciding.",
                "It just happens.",
                "Go hit the journal.",
                "After you finish — Day 9 is complete.",
            ]),
            {
                "type": "journal_prompt",
                "prompt": "When in competition do you most need a reset? What happens right now in those moments instead?",
            },
        ],
    },
    {
        "day": 10,
        "id": "d0000000-0000-0000-0000-000000000010",
        "title": "Controlling the Controllables",
        "categories": ["acceptance"],
        "blocks": [
            voiceover(10, 1, [
                "Day 10.",
                "Before competition, your brain fills up with noise.",
                "The opponent.",
                "The weather.",
                "The officiating.",
                "What your coach is thinking.",
                "Whether the scouts are paying attention.",
                "All of that feels urgent.",
                "And all of it is outside your control.",
                "Focusing on what you can't control drains execution energy.",
                "That's the leak.",
                "That's why athletes who are physically prepared still underperform.",
                "Control: preparation, process, response, effort, attitude.",
                "That's your whole list.",
                "I do this exercise with my athletes before big competitions.",
                "Write down everything on your mind.",
                "Sort it — in my control, out of my control.",
                "Circle the controllables.",
                "That's your only focus.",
                "Everything else goes on the page and stays there.",
                "That's what we're doing today.",
                "Write what's taking up space, then sort it.",
                "In my control.",
                "Out of my control.",
                "And identify what actually gets your focus.",
            ]),
            {
                "type": "prompt_cards",
                "ambient_audio": AMBIENT,
                "cards": [
                    {
                        "intro_hold_seconds": 0,
                        "prompt": "What is taking up space in your head right now about an upcoming competition or practice? Write everything down.",
                        "min_entry_seconds": 0,
                    },
                    {
                        "intro_hold_seconds": 0,
                        "prompt": "Go through your list. For each item — in my control, or out of my control?",
                        "min_entry_seconds": 0,
                    },
                    {
                        "intro_hold_seconds": 0,
                        "prompt": "What are the two or three controllables that get your full focus?",
                        "min_entry_seconds": 0,
                    },
                ],
                "summary": {"display": "all", "header": "", "hold_seconds": 0},
            },
            voiceover(10, 2, [
                "Every time you focus on something you cannot control, it costs you.",
                "This is acceptance — choosing where your energy goes.",
                "Not ignoring the pressure.",
                "Just refusing to spend yourself on things that don't move the needle.",
                "Go hit the journal.",
                "After you finish — Day 10 is complete.",
            ]),
            {
                "type": "journal_prompt",
                "prompt": "What uncontrollable do you spend the most mental energy on before competition? What would it look like to actually put it down?",
            },
        ],
    },
    {
        "day": 11,
        "id": "d0000000-0000-0000-0000-000000000011",
        "title": "The Physiological Sigh",
        "categories": ["mindfulness", "acceptance"],
        "blocks": [
            voiceover(11, 1, [
                "Day 11.",
                "Pressure hits: heart pounding, palms sweating, stomach tight.",
                "Fight or flight.",
                "Your brain treats competition like a threat.",
                "The problem is you don't need to fight or run.",
                "You need to execute.",
                "So we need a way to flip the switch fast.",
                "Move from fight-or-flight into reset mode.",
                "Rest and digest.",
                "The state where you can actually think, react, and perform.",
                "Box breathing does this.",
                "But there's a faster tool.",
                "It's called the physiological sigh.",
                "And it's the quickest way your nervous system can bring itself down.",
                "Here's how it works.",
                "Full nose inhale, then one small extra inhale.",
                "The double inhale helps your body offload CO2.",
                "Then you release it in one long, slow exhale through your mouth.",
                "That exhale is what activates the parasympathetic response.",
                "And it works within one or two cycles.",
                "On your screen you're going to practice it now.",
                "Follow the cues until you feel your body settle.",
                "Take as many cycles as you need.",
            ]),
            {
                "type": "physiological_sigh",
                "first_inhale_seconds": 3,
                "sneak_inhale_seconds": 1,
                "exhale_seconds": 8,
                "phase_cues": {
                    "first_inhale": "Breathe in fully through your nose.",
                    "sneak_inhale": "Sneak in one more small breath on top.",
                    "exhale": "Slow release through your mouth. All the way out.",
                },
                "done_label": "Done",
                "estimated_duration_seconds": 60,
            },
            voiceover(11, 2, [
                "That's the physiological sigh.",
                "Two inhales, one long exhale.",
                "You can do that in the middle of a competition and nobody around you will notice.",
                "On the bench.",
                "In the on-deck circle.",
                "At the starting line.",
                "Anywhere your nervous system needs a reset.",
                "Go hit the journal.",
                "After you finish — Day 11 is complete.",
            ]),
            {
                "type": "journal_prompt",
                "prompt": "What does fight or flight feel like in your body specifically — nausea, sweaty hands, tight chest, tunnel vision? What triggers it for you, and when would the physiological sigh be most useful?",
            },
        ],
    },
    {
        "day": 12,
        "id": "d0000000-0000-0000-0000-000000000012",
        "title": "The Evidence Log",
        "categories": ["commitment"],
        "blocks": [
            voiceover(12, 1, [
                "Day 12. Your brain has a negativity bias.",
                "It holds onto bad performances more tightly than good ones.",
                "One bad game sits heavier than five good ones.",
                "One mistake loops while twenty correct executions disappear.",
                "That's not a mental weakness. That's biology.",
                "But in sport it works against you — and we're going to fight it directly.",
                "Not with affirmations. With facts.",
                "This tool is called the evidence log.",
                "An evidence log records facts about who you are.",
                "I use this with every athlete that I coach.",
                "When the self-doubt shows up, we don't go to motivation. We go to the log.",
                "Here's what you did on Tuesday.",
                "Here's what you did in last week's competition.",
                "That is the factual record.",
                "Doubt doesn't have an argument against facts.",
                "Your log starts right now.",
                "Write one moment from last week when you competed well.",
                "Then you're going to name what it proves about you.",
            ]),
            {
                "type": "multi_field_entry",
                "ambient_audio": AMBIENT,
                "header": "Evidence Log — Entry 1",
                "fields": [
                    {
                        "label": "Describe a specific moment from the last week where you competed the way you want to compete. Be specific — what happened, where were you, what did you do?",
                        "input": True,
                    },
                    {
                        "label": "What does this moment prove about you as a competitor? Complete this sentence: 'This proves I am an athlete who...'",
                        "input": True,
                    },
                ],
                "submit_label": "Save",
                "continue_label": "Continue",
            },
            voiceover(12, 2, [
                "Add to that log after every practice.",
                "After every competition.",
                "Even on bad days — find one moment where you did something right and log it.",
                "Over 30 days it becomes something real.",
                "The factual case for believing in yourself.",
                "Go hit the journal.",
                "After you finish — Day 12 is complete.",
            ]),
            {
                "type": "journal_prompt",
                "prompt": "Why is it easier to remember mistakes than the moments you competed well? What would change if you logged the good ones just as consistently?",
            },
        ],
    },
    {
        "day": 13,
        "id": "d0000000-0000-0000-0000-000000000013",
        "title": "Building Your Daily Routine",
        "categories": ["commitment"],
        "blocks": [
            voiceover(13, 1, [
                "Day 13. You're building a daily routine.",
                "Not a workout plan. A mental performance routine.",
                "15 minutes a day that runs regardless of what else is happening.",
                "Game day, off day, travel day, bad day.",
                "Here's the principle.",
                "Consistency beats intensity.",
                "Daily focus beats occasional intensity.",
                "Never fails.",
                "The brain builds through repetition.",
                "Through showing up.",
                "Most athletes have no mental routine at all.",
                "Good days are luck.",
                "Bad days are excuses.",
                "Nothing stacks.",
                "Your routine has three moments: morning, pre-comp, end of day.",
                "Keep it simple.",
                "The simpler it is, the more likely you are to actually do it.",
                "Today, you're going to build yours.",
                "On your screen, you're going to fill in three blocks.",
                "Your morning, through pre-competition, and end of day.",
                "Keep each one simple.",
                "One or two things max per block.",
            ]),
            {
                "type": "multi_field_entry",
                "ambient_audio": AMBIENT,
                "header": "Your Daily Mental Performance Routine",
                "fields": [
                    {
                        "label": "Morning or pre-practice (5 min) — What will you do? Choose one or two: box breathing, read your identity statement, evidence log entry, focus anchor hold. Write what you'll do and when.",
                        "input": True,
                    },
                    {
                        "label": "Pre-competition trigger (2-3 min) — What is your mental sequence right before you compete or train? Include your reset and at least one other tool.",
                        "input": True,
                    },
                    {
                        "label": "End of day (5 min) — How do you close the day? Choose one: evidence log entry, journal reflection, tomorrow's intention.",
                        "input": True,
                    },
                ],
                "submit_label": "Save",
                "continue_label": "Continue",
            },
            voiceover(13, 2, [
                "That's your routine.",
                "It's not perfect — it doesn't need to be.",
                "Refine it as you go.",
                "The athletes who transform are not the ones with the best plan.",
                "They're the ones who showed up for it every day.",
                "Go hit the journal.",
                "After you finish — Day 13 is complete.",
            ]),
            {
                "type": "journal_prompt",
                "prompt": "Which part of your routine will be hardest to stick to? What usually gets in the way of your habits — and what will you do when it does?",
            },
        ],
    },
    {
        "day": 14,
        "id": "d0000000-0000-0000-0000-000000000014",
        "title": "Using Your Anchor In Competition",
        "categories": ["mindfulness", "acceptance"],
        "blocks": [
            voiceover(14, 1, [
                "Day 14. Two weeks in. Your anchor brings attention back.",
                "And today I want to make sure yours is actually ready for competition.",
                "Here's the difference between practice and game day use.",
                "Game day adds noise, fatigue, and distraction.",
                "The anchor is not something you reach for when things go wrong.",
                "By then, it's too late.",
                "You hold it proactively.",
                "Between plays, between points, between reps, between laps.",
                "Use every gap to return to your word.",
                "One athlete used his anchor between every golf shot.",
                "He used it before struggle filled the space.",
                "Today you're going to practice using yours under simulated pressure.",
                "On your screen, we're going to start with one breath to settle in.",
                "Describe your pressure moment and how you'll use your anchor.",
            ]),
            {
                "type": "timed_exercise",
                "duration_seconds": 16,
                "interactive_model": "box_breathing",
                "visual_cues": ["One full cycle. Settle in.", "Follow the circle."],
                "steps": [
                    {"text": "Inhale", "duration_seconds": 4, "haptic": "heavy"},
                    {"text": "Hold", "duration_seconds": 4, "haptic": "light"},
                    {"text": "Exhale", "duration_seconds": 4, "haptic": "heavy"},
                    {"text": "Hold", "duration_seconds": 4, "haptic": "light"},
                ],
            },
            {
                "type": "multi_field_entry",
                "ambient_audio": AMBIENT,
                "header": "Using Your Anchor In Competition",
                "fields": [
                    {
                        "label": "Describe the highest-pressure moment in your sport. The exact moment when your mind is most likely to drift — where are you, what's happening around you?",
                        "input": True,
                    },
                    {
                        "label": "In that moment, your anchor is your one word. Walk through step by step — what do you do to return to it when your mind drifts?",
                        "input": True,
                    },
                ],
                "submit_label": "Save",
                "continue_label": "Continue",
            },
            voiceover(14, 2, [
                "Your anchor goes with you.",
                "Into the competition.",
                "Into the last 400 meters when everything in your body is asking you to quit.",
                "Your anchor bridges training in here to competing out there.",
                "Go hit the journal.",
                "After you finish — Day 14 is complete.",
                "Two weeks of Relentless.",
            ]),
            {
                "type": "journal_prompt",
                "prompt": "Have you ever naturally used something like a focus anchor in competition without realizing it? What was it — and did it work?",
            },
        ],
    },
]


def block_duration_estimate(block: dict) -> int:
    t = block["type"]
    if t == "voiceover":
        return int(round(float(block["total_audio_seconds"])))
    if t == "journal_prompt":
        return 60
    if t == "prompt_cards":
        return len(block.get("cards") or []) * 25
    if t == "multi_field_entry":
        return len(block.get("fields") or []) * 25
    if t == "physiological_sigh":
        return int(block.get("estimated_duration_seconds") or 60)
    if t == "timed_exercise":
        if block.get("interactive_model"):
            return int(block.get("duration_seconds") or 0)
        return len(block.get("steps") or []) * 5
    return int(block.get("duration_seconds") or 0)


def lesson_duration_seconds(blocks: list[dict]) -> int:
    return sum(block_duration_estimate(block) for block in blocks)


def escape_sql_string(s: str) -> str:
    return s.replace("'", "''")


def local_mp3(audio_root: Path, day: int, seg: int) -> Path:
    return audio_root / f"lesson_{day:02d}" / f"lesson_{day:02d}_seg_{seg:02d}.mp3"


def align_lesson_voiceovers(model: object, audio_root: Path, lesson: dict) -> None:
    seg = 0
    day = int(lesson["day"])
    for block in lesson["blocks"]:
        if block.get("type") != "voiceover":
            continue
        seg += 1
        mp3 = local_mp3(audio_root, day, seg)
        if not mp3.is_file():
            raise FileNotFoundError(f"Missing audio: {mp3}")
        cues = [str(item["text"]) for item in block["timed_text"]]
        words = collect_words_faster_whisper(model, mp3, 0.0, "en")
        if not words:
            raise RuntimeError(f"No words collected for {mp3}")
        aligned, warns = align_cues(words, cues, min_score=0.42, max_window_words=160)
        for warning in warns:
            print(warning, file=sys.stderr)
        duration = ffprobe_duration_seconds(mp3)
        if duration is None:
            duration = float(words[-1].end_s)
        spread_tail_duplicate_starts(aligned, float(duration))
        block["timed_text"] = aligned
        block["total_audio_seconds"] = round(float(duration), 3)
        print(f"OK day {day} seg {seg}: {len(aligned)} cues, {duration:.2f}s")


def build_sql() -> str:
    lesson_ids = [lesson["id"] for lesson in LESSONS]
    lines = [
        "-- Migration: insert WOD Days 8-14 real lesson content and update program_schedule.",
        "-- Voiceover timed_text.start_s + total_audio_seconds generated from local MP3s",
        "-- using faster-whisper + ffprobe.",
        "-- Exercise/journal copy transcribed from the approved Day 8-14 scripts.",
        "",
        "begin;",
        "",
    ]
    for lesson in LESSONS:
        day = int(lesson["day"])
        sort_order = day - 1
        content_blocks = {"blocks": lesson["blocks"]}
        payload = json.dumps(content_blocks, ensure_ascii=False, separators=(",", ":"))
        duration = lesson_duration_seconds(lesson["blocks"])
        lines.extend([
            f"-- Day {day}: {lesson['title']}",
            "insert into public.lessons (",
            "  id, coach_id, title, duration_seconds, lesson_type, sort_order, published,",
            "  content_blocks",
            ")",
            "values (",
            f"  '{lesson['id']}',",
            f"  '{COACH_ID}',",
            f"  '{escape_sql_string(lesson['title'])}',",
            f"  {duration},",
            "  'standard',",
            f"  {sort_order},",
            "  true,",
            f"  '{escape_sql_string(payload)}'::jsonb",
            ")",
            "on conflict (id) do update",
            "set coach_id = excluded.coach_id,",
            "    title = excluded.title,",
            "    duration_seconds = excluded.duration_seconds,",
            "    lesson_type = excluded.lesson_type,",
            "    sort_order = excluded.sort_order,",
            "    published = excluded.published,",
            "    content_blocks = excluded.content_blocks,",
            "    updated_at = now();",
            "",
        ])

    quoted_ids = ", ".join(f"'{lesson_id}'" for lesson_id in lesson_ids)
    lines.extend([
        f"delete from public.lesson_categories where lesson_id in ({quoted_ids});",
        "",
        "insert into public.lesson_categories (lesson_id, category)",
        "values",
    ])
    cat_rows: list[str] = []
    for lesson in LESSONS:
        for category in lesson["categories"]:
            cat_rows.append(f"  ('{lesson['id']}', '{category}')")
    lines.append(",\n".join(cat_rows) + ";")
    lines.append("")

    for lesson in LESSONS:
        lines.extend([
            "update public.program_schedule",
            f"set lesson_id = '{lesson['id']}',",
            "    updated_at = now()",
            "where program_version = 'v1'",
            f"  and day_number = {lesson['day']};",
            "",
        ])

    lines.extend(["commit;", ""])
    return "\n".join(lines)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--audio-root",
        type=Path,
        default=_ROOT / "content" / "audio",
        help="Folder containing lesson_08/... through lesson_14/...",
    )
    parser.add_argument(
        "--migration-out",
        type=Path,
        default=_ROOT / "supabase" / "migrations" / "20260426000000_wod_days_8_through_14.sql",
    )
    parser.add_argument("--model", default="base")
    parser.add_argument("--device", default="cpu")
    args = parser.parse_args()

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("pip install -r scripts/voiceover_align/requirements.txt", file=sys.stderr)
        return 2

    audio_root = args.audio_root.resolve()
    if not audio_root.is_dir():
        print(f"audio-root not a directory: {audio_root}", file=sys.stderr)
        return 2

    compute_type = "float16" if args.device == "cuda" else "int8"
    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)
    for lesson in LESSONS:
        align_lesson_voiceovers(model, audio_root, lesson)

    out_path = args.migration_out.resolve()
    out_path.write_text(build_sql(), encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
