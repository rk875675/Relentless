#!/usr/bin/env python3
"""
Replace Day 6 lesson_06_seg_02 voiceover timed_text with Whisper segment transcript
(verbatim ASR from the coach MP3) so on-screen copy matches what is spoken.

Reads current lesson 6 JSON from the latest align migration, patches block
lesson_06_seg_02, writes a new Supabase migration.

Default audio: Downloads …/LESSONS 2-7/L6S2rev.mp3
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

from align_voiceover import ffprobe_duration_seconds  # noqa: E402


def extract_content_blocks(sql: str, lesson_id: str) -> dict:
    key = f"where id = '{lesson_id}'"
    pos = sql.find(key)
    if pos < 0:
        raise ValueError(lesson_id)
    chunk = sql[:pos]
    marker = "content_blocks = '"
    start = chunk.rfind(marker) + len(marker)
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


LESSON_6 = "d0000000-0000-0000-0000-000000000006"


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--audio",
        type=Path,
        default=Path(r"C:\Users\rkuma\Downloads\RELENTLESS\CONTENT\LESSONS 2-7\L6S2rev.mp3"),
    )
    p.add_argument(
        "--migration-source",
        type=Path,
        default=Path("supabase/migrations/20260419200000_align_wod_days_2_7_voiceover_timings.sql"),
        help="SQL file to read current Day 6 content_blocks from.",
    )
    p.add_argument(
        "--migration-out",
        type=Path,
        default=Path("supabase/migrations/20260419220000_day6_body_scan_timed_text_from_audio.sql"),
    )
    p.add_argument("--model", default="base")
    p.add_argument("--device", default="cpu")
    args = p.parse_args()

    ap = args.audio.resolve()
    if not ap.is_file():
        print(f"Audio not found: {ap}", file=sys.stderr)
        return 2

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("pip install -r scripts/voiceover_align/requirements.txt", file=sys.stderr)
        return 2

    sql_path = (_ROOT / args.migration_source).read_text(encoding="utf-8")
    data = extract_content_blocks(sql_path, LESSON_6)
    blocks = data["blocks"]

    vo2_idx = None
    for i, b in enumerate(blocks):
        if b.get("type") == "voiceover" and b.get("audio_files") == ["lesson_06/lesson_06_seg_02.mp3"]:
            vo2_idx = i
            break
    if vo2_idx is None:
        print("Could not find lesson_06_seg_02 voiceover block", file=sys.stderr)
        return 2

    compute_type = "float16" if args.device == "cuda" else "int8"
    model = WhisperModel(args.model, device=args.device, compute_type=compute_type)
    segments, _info = model.transcribe(str(ap), language="en", vad_filter=True)

    timed_text: list[dict] = []
    last_end = 0.0
    for seg in segments:
        t = (seg.text or "").strip()
        if not t:
            continue
        timed_text.append({"start_s": round(float(seg.start), 3), "text": t})
        last_end = float(seg.end)

    dur = ffprobe_duration_seconds(ap)
    if dur is None:
        dur = round(last_end, 3)

    blocks[vo2_idx]["timed_text"] = timed_text
    blocks[vo2_idx]["total_audio_seconds"] = round(float(dur), 3)

    dur_total = lesson_duration_seconds(blocks)
    payload = json.dumps({"blocks": blocks}, ensure_ascii=False)
    esc = escape_sql_json_string(payload)

    out = "\n".join(
        [
            "-- Day 6 body scan: replace lesson_06_seg_02 timed_text with Whisper segment",
            "-- transcript (verbatim ASR) so on-screen lines match the shipped recording.",
            "-- Other blocks unchanged from 20260419200000_align_wod_days_2_7_voiceover_timings.sql.",
            "",
            "begin;",
            "",
            "update public.lessons",
            f"set duration_seconds = {dur_total},",
            f"    content_blocks = '{esc}'::jsonb,",
            "    updated_at = now()",
            f"where id = '{LESSON_6}';",
            "",
            "commit;",
            "",
        ]
    )
    out_path = (_ROOT / args.migration_out).resolve()
    out_path.write_text(out, encoding="utf-8")
    print(f"Wrote {out_path} ({len(timed_text)} timed_text cues, total_audio_seconds={dur})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
