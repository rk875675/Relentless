#!/usr/bin/env python3
"""
Day 1 first voiceover was the only multi-file block (lesson_01_seg_01.mp3 +
lesson_01_seg_02.mp3 played back-to-back). The mobile player concatenates
these by adding `audioStatus.duration` to a cumulative offset whenever
`didJustFinish` fires for the first file, then resolving cue start_s as
`offset + currentTime` against the second file.

In practice expo-audio's reported duration drifts from the alignment-time
ffprobe duration (especially for VBR MP3s without Xing/LAME headers), so
the seg_02 cues — Mindfulness / Acceptance / Commitment / Which one — fire
at the wrong time on device.

Fix: concat L1S1.mp3 + L1S2.mp3 into a single lesson_01_seg_01_02.mp3, upload
to the audio bucket, transcribe the SINGLE combined file with Whisper, then
align the 7 curated cues against those Whisper words. Update Day 1 block 1
to use the single audio_files entry — the cumulative-offset code path is
never exercised, eliminating the drift class entirely.

Inputs:
  --audio   path to the combined mp3 (default: tmp_audio_deployed/lesson_01/lesson_01_seg_01_02.mp3)
  --duration  total audio duration in seconds (default: 110.56, measured by ffmpeg)
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

from align_voiceover import (  # noqa: E402
    align_cues,
    collect_words_faster_whisper,
    spread_tail_duplicate_starts,
)
from build_audit_fixes_migration import (  # noqa: E402
    LESSON_IDS,
    block_duration_estimate,
    escape_sql_json_string,
    extract_content_blocks,
    lesson_duration_seconds,
)


PRIOR_SQL = (
    "supabase/migrations/"
    "20260419290000_revert_to_curated_voiceover_split_multi_only.sql"
)
OUT_MIGRATION = (
    "supabase/migrations/"
    "20260420000000_day1_combined_audio_no_cumulative_offset.sql"
)
NEW_AUDIO_PATH = "lesson_01/lesson_01_seg_01_02.mp3"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--audio",
        type=Path,
        default=Path(
            r"C:\Users\rkuma\Relentless\tmp_audio_deployed\lesson_01\lesson_01_seg_01_02.mp3"
        ),
    )
    p.add_argument(
        "--duration",
        type=float,
        default=110.56,
        help="Combined audio duration in seconds (measured by ffmpeg).",
    )
    p.add_argument("--model", default="base")
    p.add_argument("--device", default="cpu")
    p.add_argument(
        "--migration-out", type=Path, default=Path(OUT_MIGRATION)
    )
    args = p.parse_args()

    audio = args.audio.resolve()
    if not audio.is_file():
        print(f"Audio not found: {audio}", file=sys.stderr)
        return 2

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print(
            "pip install -r scripts/voiceover_align/requirements.txt",
            file=sys.stderr,
        )
        return 2

    # Load current Day 1 from the latest migration; we'll update only block 1
    # (the first voiceover) to use the new combined audio file.
    sql_text = (_ROOT / PRIOR_SQL).read_text(encoding="utf-8")
    data = extract_content_blocks(sql_text, LESSON_IDS[1])
    blocks = data["blocks"]

    target_idx = None
    for i, b in enumerate(blocks):
        if b.get("type") == "voiceover" and b.get("audio_files") == [
            "lesson_01/lesson_01_seg_01.mp3",
            "lesson_01/lesson_01_seg_02.mp3",
        ]:
            target_idx = i
            break
    if target_idx is None:
        print("Day 1 block 1 (multi-file voiceover) not found", file=sys.stderr)
        return 2

    # Curated short cues — same text user signed off on for the first VO.
    curated_cues: list[str] = [
        "Welcome to Relentless.",
        "This is mental performance training.",
        "The framework is called MAC.",
        "Mindfulness — notice where your attention is and choose where it goes.",
        "Acceptance — feel uncomfortable without treating it like an emergency.",
        "Commitment — show up, regardless of how you feel.",
        "Which one do you need most?",
    ]

    compute_type = "float16" if args.device == "cuda" else "int8"
    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)

    words = collect_words_faster_whisper(model, audio, 0.0, "en")
    if not words:
        print(f"No Whisper words for {audio}", file=sys.stderr)
        return 2

    aligned, warns = align_cues(
        words, curated_cues, min_score=0.42, max_window_words=140
    )
    for w in warns:
        print(f"  WARN: {w}", file=sys.stderr)
    spread_tail_duplicate_starts(aligned, float(args.duration))

    # Patch the block.
    blocks[target_idx]["audio_files"] = [NEW_AUDIO_PATH]
    blocks[target_idx]["total_audio_seconds"] = round(float(args.duration), 3)
    blocks[target_idx]["timed_text"] = aligned
    print(f"Day 1 block 1 -> single file {NEW_AUDIO_PATH}, {len(aligned)} cues")
    for c in aligned:
        print(f"   {c['start_s']:>7.2f}  {c['text']}")

    dur = lesson_duration_seconds(blocks)

    payload = json.dumps({"blocks": blocks}, ensure_ascii=False)
    esc = escape_sql_json_string(payload)
    sql = "\n".join(
        [
            "-- Day 1 first voiceover: collapse the two-file audio block into a single",
            "-- combined mp3 (lesson_01_seg_01_02.mp3) so the mobile player never has to",
            "-- run the cross-file cumulative-offset path that was firing seg_02 cues",
            "-- (Mindfulness / Acceptance / Commitment / Which one) at the wrong time.",
            "-- The combined audio is byte-identical to L1S1.mp3 + L1S2.mp3 played in",
            "-- order; cues re-aligned against the single Whisper transcribe.",
            "",
            "begin;",
            "",
            "update public.lessons",
            f"set duration_seconds = {dur},",
            f"    content_blocks = '{esc}'::jsonb,",
            "    updated_at = now()",
            f"where id = '{LESSON_IDS[1]}';",
            "",
            "commit;",
            "",
        ]
    )
    out_path = (_ROOT / args.migration_out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(sql, encoding="utf-8")
    print(f"\nWrote {out_path}")
    print(f"  Day 1 duration_seconds = {dur}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
