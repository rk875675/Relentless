#!/usr/bin/env python3
"""
Build supabase migration 20260419270000_*.sql restoring Whisper-aligned timings:

- Day 1 first voiceover (lesson_01_seg_01.mp3 + lesson_01_seg_02.mp3) -> verbatim
  copy from 20260419210000_align_wod_day1_voiceover_timings.sql (Whisper run that
  the user confirmed sounded right).
- Day 1 second voiceover (lesson_01_seg_03.mp3) -> preserved from current state in
  20260419260000_restore_day6_seg02_script_day1_vo2_coach.sql (coach-tuned).
- Day 6 lesson_06_seg_01.mp3 -> re-align cues against the recording, with the
  multi-sentence cue "Tight jaw. Raised shoulders. Clenched fists. Shallow
  breathing." split into 4 single-sentence cues so the renderer shows one
  sentence at a time.
- Day 6 lesson_06_seg_02.mp3 -> verbatim Whisper segment transcript from
  20260419220000_day6_body_scan_timed_text_from_audio.sql (41 sentence-level
  cues that match the actual recording near the end).
- Day 6 lesson_06_seg_03.mp3 -> unchanged from 20260419220000.

Default audio file for re-alignment: ...\\LESSONS 2-7\\L6S1rev.mp3 (matches the
naming convention used by run_wod_days_2_7_align.local_mp3 for Day 6).
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


LESSON_1 = "d0000000-0000-0000-0000-000000000001"
LESSON_6 = "d0000000-0000-0000-0000-000000000006"

DAY1_WHISPER_SQL = "supabase/migrations/20260419210000_align_wod_day1_voiceover_timings.sql"
DAY1_CURRENT_SQL = "supabase/migrations/20260419260000_restore_day6_seg02_script_day1_vo2_coach.sql"
DAY6_WHISPER_SQL = "supabase/migrations/20260419220000_day6_body_scan_timed_text_from_audio.sql"
OUT_MIGRATION = (
    "supabase/migrations/"
    "20260419270000_restore_whisper_day1_vo1_day6_seg01_split_seg02.sql"
)


def extract_content_blocks(sql: str, lesson_id: str) -> dict:
    key = f"where id = '{lesson_id}'"
    pos = sql.find(key)
    if pos < 0:
        raise ValueError(f"lesson {lesson_id} not found in SQL")
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


def escape_sql_json_string(s: str) -> str:
    return s.replace("'", "''")


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
        return len(block.get("cards") or []) * 25
    if t == "flash_cards":
        return len(block.get("cards") or []) * 25
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


# Day 6 seg_01 cues with the "Tight jaw..." cue split into 4 single-sentence cues.
DAY6_SEG01_CUES_SPLIT: list[str] = [
    "Day 6.",
    "Anxiety shows up in your body before it shows up in your thoughts.",
    "Tight jaw.",
    "Raised shoulders.",
    "Clenched fists.",
    "Shallow breathing.",
    "You've felt all of it before a big competition.",
    "Today we fix that.",
    "We're going to scan your body from head to toe.",
    "This teaches you to read your own nervous system in real time.",
    "Before we start — take one box breath with me.",
]


def build_day6_blocks(audio_root: Path, model_size: str, device: str) -> dict:
    """Return Day 6 content_blocks dict with re-aligned seg_01 (4-way split) and
    seg_02/seg_03 verbatim from the 20260419220000 Whisper migration."""
    src_sql = (_ROOT / DAY6_WHISPER_SQL).read_text(encoding="utf-8")
    data = extract_content_blocks(src_sql, LESSON_6)
    blocks = data["blocks"]

    seg01_idx = None
    for i, b in enumerate(blocks):
        if b.get("type") == "voiceover" and b.get("audio_files") == [
            "lesson_06/lesson_06_seg_01.mp3"
        ]:
            seg01_idx = i
            break
    if seg01_idx is None:
        raise RuntimeError("lesson_06_seg_01 voiceover block not found in source SQL")

    mp3 = audio_root / "L6S1rev.mp3"
    if not mp3.is_file():
        raise FileNotFoundError(f"Audio not found: {mp3}")

    try:
        from faster_whisper import WhisperModel
    except ImportError as exc:
        raise SystemExit(
            "Install deps: pip install -r scripts/voiceover_align/requirements.txt"
        ) from exc

    compute_type = "float16" if device == "cuda" else "int8"
    model = WhisperModel(model_size, device=device, compute_type=compute_type)

    words = collect_words_faster_whisper(model, mp3, 0.0, "en")
    if not words:
        raise RuntimeError(f"No Whisper words decoded for {mp3}")

    aligned, warns = align_cues(
        words,
        DAY6_SEG01_CUES_SPLIT,
        min_score=0.42,
        max_window_words=80,
    )
    for w in warns:
        print(w, file=sys.stderr)

    dur = ffprobe_duration_seconds(mp3)
    if dur is None:
        dur = float(words[-1].end_s)
    spread_tail_duplicate_starts(aligned, float(dur))

    blocks[seg01_idx]["timed_text"] = aligned
    blocks[seg01_idx]["total_audio_seconds"] = round(float(dur), 3)

    print(
        f"OK Day 6 seg_01 ({mp3.name}): {len(aligned)} cues, "
        f"total_audio_seconds={dur:.2f}",
    )
    return {"blocks": blocks}


def build_day1_blocks() -> dict:
    """Day 1 first VO from Whisper migration; second VO preserved from current."""
    whisper_sql = (_ROOT / DAY1_WHISPER_SQL).read_text(encoding="utf-8")
    data = extract_content_blocks(whisper_sql, LESSON_1)
    blocks = data["blocks"]

    current_sql = (_ROOT / DAY1_CURRENT_SQL).read_text(encoding="utf-8")
    cur = extract_content_blocks(current_sql, LESSON_1)
    cur_seg03 = None
    for b in cur["blocks"]:
        if b.get("type") == "voiceover" and b.get("audio_files") == [
            "lesson_01/lesson_01_seg_03.mp3"
        ]:
            cur_seg03 = b
            break
    if cur_seg03 is None:
        raise RuntimeError("Could not find current Day 1 seg_03 voiceover block")

    seg03_idx = None
    for i, b in enumerate(blocks):
        if b.get("type") == "voiceover" and b.get("audio_files") == [
            "lesson_01/lesson_01_seg_03.mp3"
        ]:
            seg03_idx = i
            break
    if seg03_idx is None:
        raise RuntimeError("Could not find Day 1 seg_03 voiceover block in Whisper SQL")

    blocks[seg03_idx]["total_audio_seconds"] = float(cur_seg03["total_audio_seconds"])
    blocks[seg03_idx]["timed_text"] = list(cur_seg03["timed_text"])
    return {"blocks": blocks}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--audio-root",
        type=Path,
        required=True,
        help="Folder containing L6S1rev.mp3 (Day 6 seg_01 recording).",
    )
    p.add_argument("--model", default="base")
    p.add_argument("--device", default="cpu")
    p.add_argument(
        "--migration-out",
        type=Path,
        default=Path(OUT_MIGRATION),
    )
    args = p.parse_args()

    audio_root = args.audio_root.resolve()
    if not audio_root.is_dir():
        print(f"audio-root not a directory: {audio_root}", file=sys.stderr)
        return 2

    day1 = build_day1_blocks()
    day6 = build_day6_blocks(audio_root, args.model, args.device)

    d1_dur = lesson_duration_seconds(day1["blocks"])
    d6_dur = lesson_duration_seconds(day6["blocks"])

    p1 = escape_sql_json_string(json.dumps(day1, ensure_ascii=False))
    p6 = escape_sql_json_string(json.dumps(day6, ensure_ascii=False))

    sql = "\n".join(
        [
            "-- Restore Whisper-aligned voiceover timings:",
            "--   Day 1 first VO (seg_01+seg_02): from 20260419210000 (Whisper).",
            "--   Day 1 second VO (seg_03): unchanged from 20260419260000 (coach-tuned).",
            "--   Day 6 seg_01: re-aligned with the multi-sentence \"Tight jaw...\" cue",
            "--     split into 4 single-sentence cues so the renderer shows one",
            "--     sentence at a time.",
            "--   Day 6 seg_02: verbatim Whisper segment transcript from 20260419220000",
            "--     (41 sentence-level cues that match the actual recording).",
            "--   Day 6 seg_03: unchanged from 20260419220000.",
            "",
            "begin;",
            "",
            "update public.lessons",
            f"set duration_seconds = {d1_dur},",
            f"    content_blocks = '{p1}'::jsonb,",
            "    updated_at = now()",
            f"where id = '{LESSON_1}';",
            "",
            "update public.lessons",
            f"set duration_seconds = {d6_dur},",
            f"    content_blocks = '{p6}'::jsonb,",
            "    updated_at = now()",
            f"where id = '{LESSON_6}';",
            "",
            "commit;",
            "",
        ]
    )

    out_path = (_ROOT / args.migration_out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(sql, encoding="utf-8")
    print(f"Wrote {out_path}")
    print(f"  Day 1 duration_seconds = {d1_dur}")
    print(f"  Day 6 duration_seconds = {d6_dur}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
