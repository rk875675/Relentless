#!/usr/bin/env python3
"""
Align WOD Day 1 voiceover blocks from 20260410000000_lesson1_flash_cards.sql
against local MP3s: L1S1.mp3, L1S2.mp3 (first voiceover), L1S3.mp3 (second).

Usage:
  python scripts/voiceover_align/run_wod_day1_align.py ^
    --audio-root "C:\\Users\\...\\LESSON 1" --model base
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
    WordSpan,
    align_cues,
    collect_words_faster_whisper,
    ffprobe_duration_seconds,
    spread_tail_duplicate_starts,
)

LESSON_ID = "d0000000-0000-0000-0000-000000000001"


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


def block_duration_estimate(block: dict) -> int:
    t = block["type"]
    if t == "voiceover":
        return int(round(float(block["total_audio_seconds"])))
    if t == "journal_prompt":
        return 60
    if t == "flash_cards":
        return len(block.get("cards") or []) * 25
    if t == "prompt_cards":
        return len(block.get("cards") or []) * 25
    if t == "timed_exercise":
        if block.get("interactive_model"):
            d = int(block.get("duration_seconds") or 0)
            if block.get("interactive_model") == "box_breathing" and d > 0:
                return max(16, d)
            return d
        steps = block.get("steps") or []
        return len(steps) * 5
    return int(block.get("duration_seconds") or 0)


def lesson_duration_seconds(blocks: list[dict]) -> int:
    return sum(block_duration_estimate(b) for b in blocks)


def escape_sql_json_string(s: str) -> str:
    return s.replace("'", "''")


def align_multi_file_voiceover(
    model: object,
    mp3_paths: list[Path],
    cues: list[str],
) -> tuple[list[dict], float]:
    all_words: list[WordSpan] = []
    offset = 0.0
    total_dur = 0.0
    for ap in mp3_paths:
        dur = ffprobe_duration_seconds(ap)
        words = collect_words_faster_whisper(model, ap, offset, "en")
        if not words:
            raise RuntimeError(f"No words for {ap}")
        all_words.extend(words)
        last_end = words[-1].end_s if words else offset
        if dur is not None:
            offset += dur
            total_dur += dur
        else:
            offset = last_end
            total_dur = last_end
    aligned, warns = align_cues(all_words, cues, min_score=0.42, max_window_words=140)
    for w in warns:
        print(w, file=sys.stderr)
    spread_tail_duplicate_starts(aligned, float(total_dur or offset))
    return aligned, float(total_dur or offset)


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--audio-root", type=Path, required=True)
    p.add_argument(
        "--migration-in",
        type=Path,
        default=Path("supabase/migrations/20260410000000_lesson1_flash_cards.sql"),
    )
    p.add_argument(
        "--migration-out",
        type=Path,
        default=Path("supabase/migrations/20260419210000_align_wod_day1_voiceover_timings.sql"),
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

    sql_text = (_ROOT / args.migration_in).read_text(encoding="utf-8")
    data = extract_content_blocks(sql_text, LESSON_ID)
    blocks = data["blocks"]

    compute_type = "float16" if args.device == "cuda" else "int8"
    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)

    seg = 0
    for block in blocks:
        if block.get("type") != "voiceover":
            continue
        paths: list[Path] = []
        for _ in block.get("audio_files") or []:
            seg += 1
            mp3 = audio_root / f"L1S{seg}.mp3"
            if not mp3.is_file():
                print(f"Missing audio: {mp3}", file=sys.stderr)
                return 2
            paths.append(mp3)
        cues = [str(x["text"]) for x in block["timed_text"]]
        aligned, total = align_multi_file_voiceover(model, paths, cues)
        block["timed_text"] = aligned
        block["total_audio_seconds"] = round(total, 3)
        print(f"OK voiceover ({', '.join(p.name for p in paths)}): {len(aligned)} cues, {total:.2f}s total")

    dur_total = lesson_duration_seconds(blocks)
    payload = json.dumps({"blocks": blocks}, ensure_ascii=False)
    esc = escape_sql_json_string(payload)
    out = "\n".join(
        [
            "-- Align WOD Day 1 voiceover timed_text + total_audio_seconds (Whisper + ffprobe).",
            "-- Recomputes duration_seconds (voiceover + flash_cards + journal).",
            "",
            "begin;",
            "",
            f"update public.lessons",
            f"set duration_seconds = {dur_total},",
            f"    content_blocks = '{esc}'::jsonb,",
            f"    updated_at = now()",
            f"where id = '{LESSON_ID}';",
            "",
            "commit;",
            "",
        ]
    )
    out_path = (_ROOT / args.migration_out).resolve()
    out_path.write_text(out, encoding="utf-8")
    print(f"Wrote {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
