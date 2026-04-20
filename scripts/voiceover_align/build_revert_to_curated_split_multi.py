#!/usr/bin/env python3
"""
Revert 20260419280000_voiceover_one_sentence_per_cue_audit_fixes.sql back to
the SHORT, COACH-CURATED on-screen text — keep Whisper timings only.

Inputs (the "before" state per per-day):
  - Day 1 + Day 6: from 20260419270000_restore_whisper_day1_vo1_day6_seg01_split_seg02.sql
  - Days 2-5, 7:    from 20260419200000_align_wod_days_2_7_voiceover_timings.sql

For each voiceover block we apply ONLY split_multi:
  * keep curated text exactly as authored
  * if any cue contains > 1 sentence, split it into N single-sentence cues
  * re-align ALL cues against Whisper word timestamps (existing align_cues
    helper) to get Whisper-accurate start_s for each new cue.

NO whisper_full (no replacing curated text with verbatim ASR transcript).
NO clause-splitting of long single sentences.
Day 6 is preserved verbatim from 20260419270000 (b1 split, b2 verbatim
Whisper segments, b3 unchanged) — user is happy with that state.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_ALIGN = Path(__file__).resolve().parent
if str(_ALIGN) not in sys.path:
    sys.path.insert(0, str(_ALIGN))

from build_audit_fixes_migration import (  # noqa: E402
    LESSON_IDS,
    block_duration_estimate,
    escape_sql_json_string,
    extract_content_blocks,
    lesson_duration_seconds,
    local_mp3,
    split_multi_curated,
)


DAY1_DAY6_SQL = (
    "supabase/migrations/"
    "20260419270000_restore_whisper_day1_vo1_day6_seg01_split_seg02.sql"
)
DAYS_2_7_SQL = (
    "supabase/migrations/20260419200000_align_wod_days_2_7_voiceover_timings.sql"
)
OUT_MIGRATION = (
    "supabase/migrations/"
    "20260419290000_revert_to_curated_voiceover_split_multi_only.sql"
)


def base_blocks_for_day(day: int) -> list[dict]:
    src = DAY1_DAY6_SQL if day in (1, 6) else DAYS_2_7_SQL
    sql = (_ROOT / src).read_text(encoding="utf-8")
    data = extract_content_blocks(sql, LESSON_IDS[day])
    return data["blocks"]


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--audio-root",
        type=Path,
        default=Path(r"C:\Users\rkuma\Downloads\RELENTLESS\CONTENT\LESSONS 2-7"),
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

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("pip install -r scripts/voiceover_align/requirements.txt", file=sys.stderr)
        return 2

    compute_type = "float16" if args.device == "cuda" else "int8"
    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)

    updates: list[tuple[int, list[dict], int]] = []

    for day in [1, 2, 3, 4, 5, 6, 7]:
        print(f"--- Day {day} ---")
        blocks = base_blocks_for_day(day)

        if day == 6:
            # Preserve Day 6 entirely as-is in 20260419270000.
            print("  Day 6: preserved from 20260419270000 (no change)")
        else:
            block_idx = 0
            audio_cursor = 0
            for b in blocks:
                if b.get("type") != "voiceover":
                    continue
                block_idx += 1
                n_audio = len(b.get("audio_files") or [])
                seg_indices = list(
                    range(audio_cursor + 1, audio_cursor + 1 + n_audio)
                )
                audio_cursor += n_audio
                mp3_paths = [local_mp3(audio_root, day, k) for k in seg_indices]
                for mp3 in mp3_paths:
                    if not mp3.is_file():
                        raise FileNotFoundError(mp3)
                cues = split_multi_curated(model, mp3_paths, b["timed_text"])
                b["timed_text"] = cues
                print(
                    f"  Day {day} block {block_idx}: split_multi -> "
                    f"{len(cues)} cues"
                )

        dur = lesson_duration_seconds(blocks)
        updates.append((day, blocks, dur))

    out_lines = [
        "-- Revert to short coach-curated on-screen text + Whisper timings only.",
        "-- Strategy: split any multi-sentence cue into single-sentence cues,",
        "-- re-align every cue against Whisper word timestamps. NO replacement",
        "-- with verbatim ASR transcript. Day 6 preserved from 20260419270000",
        "-- (sentence-level Whisper transcript that the user signed off on).",
        "",
        "begin;",
        "",
    ]
    for day, blocks, dur in updates:
        payload = json.dumps({"blocks": blocks}, ensure_ascii=False)
        esc = escape_sql_json_string(payload)
        out_lines.append("update public.lessons")
        out_lines.append(f"set duration_seconds = {dur},")
        out_lines.append(f"    content_blocks = '{esc}'::jsonb,")
        out_lines.append("    updated_at = now()")
        out_lines.append(f"where id = '{LESSON_IDS[day]}';")
        out_lines.append("")
    out_lines.append("commit;")
    out_lines.append("")

    out_path = (_ROOT / args.migration_out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text("\n".join(out_lines), encoding="utf-8")
    print(f"\nWrote {out_path}")
    for day, _, dur in updates:
        print(f"  Day {day} duration_seconds = {dur}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
