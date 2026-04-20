#!/usr/bin/env python3
"""
Extract WOD Days 2–7 content_blocks from 20260419170000_wod_days_2_7_exercise_fix.sql,
align each voiceover to local MP3s (L2S1.mp3 … L7S2.mp3 under LESSONS 2-7),
recompute duration_seconds, write a new Supabase migration.

Usage:
  python scripts/voiceover_align/run_wod_days_2_7_align.py ^
    --audio-root "C:\\Users\\rkuma\\Downloads\\RELENTLESS\\CONTENT\\LESSONS 2-7" ^
    --model base

Requires: pip install -r scripts/voiceover_align/requirements.txt, ffmpeg on PATH.
"""

from __future__ import annotations

import argparse
import json
import re
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

LESSON_IDS = [
    "d0000000-0000-0000-0000-000000000002",
    "d0000000-0000-0000-0000-000000000003",
    "d0000000-0000-0000-0000-000000000004",
    "d0000000-0000-0000-0000-000000000005",
    "d0000000-0000-0000-0000-000000000006",
    "d0000000-0000-0000-0000-000000000007",
]


def extract_content_blocks(sql: str, lesson_id: str) -> dict:
    key = f"where id = '{lesson_id}'"
    pos = sql.find(key)
    if pos < 0:
        raise ValueError(f"lesson {lesson_id} not found")
    chunk = sql[:pos]
    marker = "content_blocks = '"
    start = chunk.rfind(marker)
    if start < 0:
        raise ValueError("content_blocks marker not found")
    start += len(marker)
    buf: list[str] = []
    i = start
    while i < len(chunk):
        c = chunk[i]
        if c == "'" and i + 1 < len(chunk) and chunk[i + 1] == "'":
            buf.append("'")
            i += 2
            continue
        if c == "'":
            break
        buf.append(c)
        i += 1
    return json.loads("".join(buf))


def local_mp3(lesson_day: int, seg_1based: int, audio_root: Path) -> Path:
    if lesson_day == 6:
        name = f"L6S{seg_1based}rev.mp3"
    else:
        name = f"L{lesson_day}S{seg_1based}.mp3"
    return audio_root / name


def block_duration_estimate(block: dict) -> int:
    t = block["type"]
    if t == "voiceover":
        return int(round(float(block["total_audio_seconds"])))
    if t == "journal_prompt":
        return 60
    if t == "multi_select":
        return 25
    if t == "examples_with_entry":
        return 45
    if t == "anchor_entry":
        return 45
    if t == "prompt_cards":
        cards = block.get("cards") or []
        return len(cards) * 25
    if t == "timed_exercise":
        if block.get("interactive_model"):
            d = int(block.get("duration_seconds") or 0)
            if block.get("interactive_model") == "box_breathing" and d > 0:
                return max(16, d)
            return d
        steps = block.get("steps") or []
        return len(steps) * 5
    if t == "tap_through_text":
        return len(block.get("paragraphs") or []) * 4
    return int(block.get("duration_seconds") or 0)


def lesson_duration_seconds(blocks: list[dict]) -> int:
    return sum(block_duration_estimate(b) for b in blocks)


def escape_sql_json_string(s: str) -> str:
    return s.replace("'", "''")


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--audio-root",
        type=Path,
        required=True,
        help="Folder containing L2S1.mp3 … L7S2.mp3",
    )
    p.add_argument(
        "--migration-in",
        type=Path,
        default=Path("supabase/migrations/20260419170000_wod_days_2_7_exercise_fix.sql"),
        help="Source SQL containing content_blocks for days 2–7.",
    )
    p.add_argument(
        "--migration-out",
        type=Path,
        default=Path("supabase/migrations/20260419200000_align_wod_days_2_7_voiceover_timings.sql"),
        help="Output migration path.",
    )
    p.add_argument("--model", default="base")
    p.add_argument("--device", default="cpu")
    args = p.parse_args()

    audio_root = args.audio_root.resolve()
    if not audio_root.is_dir():
        print(f"audio-root not a directory: {audio_root}", file=sys.stderr)
        return 2

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("pip install -r scripts/voiceover_align/requirements.txt", file=sys.stderr)
        return 2

    sql_path = (_ROOT / args.migration_in).resolve()
    sql_text = sql_path.read_text(encoding="utf-8")

    compute_type = "float16" if args.device == "cuda" else "int8"
    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)

    updates: list[tuple[str, dict, int]] = []

    for lesson_idx, lesson_id in enumerate(LESSON_IDS):
        lesson_day = lesson_idx + 2
        data = extract_content_blocks(sql_text, lesson_id)
        blocks = data["blocks"]
        seg = 0
        for block in blocks:
            if block.get("type") != "voiceover":
                continue
            seg += 1
            mp3 = local_mp3(lesson_day, seg, audio_root)
            if not mp3.is_file():
                print(f"Missing audio: {mp3}", file=sys.stderr)
                return 2
            cues = [str(x["text"]) for x in block["timed_text"]]
            words = collect_words_faster_whisper(model, mp3, 0.0, "en")
            if not words:
                print(f"No words for {mp3}", file=sys.stderr)
                return 2
            aligned, warns = align_cues(words, cues, min_score=0.42, max_window_words=140)
            for w in warns:
                print(w, file=sys.stderr)
            dur = ffprobe_duration_seconds(mp3)
            if dur is None:
                dur = float(words[-1].end_s)
            spread_tail_duplicate_starts(aligned, float(dur))
            block["timed_text"] = aligned
            block["total_audio_seconds"] = round(float(dur), 3)
            print(f"OK lesson day {lesson_day} seg {seg} ({mp3.name}): {len(aligned)} cues, {dur:.2f}s")

        dur_total = lesson_duration_seconds(blocks)
        updates.append((lesson_id, {"blocks": blocks}, dur_total))

    out_lines = [
        "-- Auto-generated: align voiceover timed_text + total_audio_seconds from Whisper",
        "-- against local recordings; recompute duration_seconds for WOD days 2–7.",
        "",
        "begin;",
        "",
    ]
    for lesson_id, cb, dsec in updates:
        payload = json.dumps(cb, ensure_ascii=False)
        esc = escape_sql_json_string(payload)
        out_lines.append(f"update public.lessons")
        out_lines.append(f"set duration_seconds = {dsec},")
        out_lines.append(f"    content_blocks = '{esc}'::jsonb")
        out_lines.append(f"where id = '{lesson_id}';")
        out_lines.append("")

    out_lines.append("commit;")
    out_lines.append("")

    out_path = (_ROOT / args.migration_out).resolve()
    out_path.write_text("\n".join(out_lines), encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
