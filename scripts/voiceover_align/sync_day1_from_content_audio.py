#!/usr/bin/env python3
"""
Day 1: concat content/audio/lesson_01/lesson_01_seg_01+02.mp3 → lesson_01_seg_01_02.mp3,
run faster-whisper alignment for cue text taken verbatim from content/lessons/lesson_01.json,
update that JSON + emit a Supabase migration.

Prepends imageio-ffmpeg to PATH so ffmpeg exists for Whisper and concat (Windows-friendly).

Usage (from repo root):
  pip install -r scripts/voiceover_align/requirements.txt imageio-ffmpeg
  python scripts/voiceover_align/sync_day1_from_content_audio.py
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_ALIGN = Path(__file__).resolve().parent
if str(_ALIGN) not in sys.path:
    sys.path.insert(0, str(_ALIGN))

from align_voiceover import (  # noqa: E402
    align_cues,
    collect_words_faster_whisper,
    ffprobe_duration_seconds,
    spread_tail_duplicate_starts,
)
from build_audit_fixes_migration import (  # noqa: E402
    escape_sql_json_string,
    lesson_duration_seconds,
)

LESSON_ID = "d0000000-0000-0000-0000-000000000001"
AUDIO_DIR = _ROOT / "content" / "audio" / "lesson_01"
LESSON_JSON = _ROOT / "content" / "lessons" / "lesson_01.json"
OUT_MIGRATION = _ROOT / "supabase" / "migrations" / "20260420120000_day1_whisper_from_content_audio.sql"
COMBINED_NAME = "lesson_01_seg_01_02.mp3"


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError:
        print(
            "Install imageio-ffmpeg so bundled ffmpeg is available: pip install imageio-ffmpeg",
            file=sys.stderr,
        )
        raise SystemExit(2) from None


def prepend_ffmpeg_path() -> None:
    """Put bundled ffmpeg on PATH for faster-whisper / ffprobe helpers."""
    d = str(Path(ffmpeg_exe()).parent)
    os.environ["PATH"] = d + os.pathsep + os.environ.get("PATH", "")


def ffmpeg_concat(seg_a: Path, seg_b: Path, out_mp3: Path) -> None:
    with tempfile.NamedTemporaryFile(
        mode="w",
        suffix=".txt",
        delete=False,
        encoding="utf-8",
    ) as f:
        for p in (seg_a, seg_b):
            ap = p.resolve().as_posix().replace("'", "'\\''")
            f.write(f"file '{ap}'\n")
        list_path = f.name
    try:
        cmd = [
            ffmpeg_exe(),
            "-hide_banner",
            "-loglevel",
            "error",
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            list_path,
            "-c",
            "copy",
            str(out_mp3),
        ]
        subprocess.run(cmd, check=True)
    finally:
        Path(list_path).unlink(missing_ok=True)


def align_voiceover_block(
    model: object,
    mp3: Path,
    cues: list[str],
) -> tuple[list[dict], float]:
    dur = ffprobe_duration_seconds(mp3)
    words = collect_words_faster_whisper(model, mp3, 0.0, "en")
    if not words:
        raise RuntimeError(f"No Whisper words for {mp3}")
    aligned, warns = align_cues(words, cues, min_score=0.42, max_window_words=140)
    for w in warns:
        print(f"  WARN: {w}", file=sys.stderr)
    end = float(dur) if dur is not None else float(words[-1].end_s)
    spread_tail_duplicate_starts(aligned, end)
    return aligned, round(float(end), 3)


def main() -> int:
    prepend_ffmpeg_path()

    seg1 = AUDIO_DIR / "lesson_01_seg_01.mp3"
    seg2 = AUDIO_DIR / "lesson_01_seg_02.mp3"
    seg3 = AUDIO_DIR / "lesson_01_seg_03.mp3"
    combined = AUDIO_DIR / COMBINED_NAME

    for p in (seg1, seg2, seg3):
        if not p.is_file():
            print(f"Missing required audio: {p}", file=sys.stderr)
            return 2
    if not LESSON_JSON.is_file():
        print(f"Missing {LESSON_JSON}", file=sys.stderr)
        return 2

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("pip install -r scripts/voiceover_align/requirements.txt", file=sys.stderr)
        return 2

    lesson = json.loads(LESSON_JSON.read_text(encoding="utf-8"))
    blocks: list[dict] = lesson["blocks"]

    print("Concatenating seg_01 + seg_02 -> lesson_01_seg_01_02.mp3 ...")
    ffmpeg_concat(seg1, seg2, combined)

    compute_type = "int8"
    model = WhisperModel("base", device="cpu", compute_type=compute_type)

    for i, block in enumerate(blocks):
        if block.get("type") != "voiceover":
            continue
        files = list(block.get("audio_files") or [])
        if len(files) == 1 and files[0].endswith(COMBINED_NAME):
            cues = [str(x["text"]) for x in block["timed_text"]]
            print(f"Block {i}: align combined ({combined.name}), {len(cues)} cues ...")
            aligned, total = align_voiceover_block(model, combined, cues)
            block["audio_files"] = ["lesson_01/" + COMBINED_NAME]
            block["total_audio_seconds"] = total
            block["timed_text"] = aligned
        elif files == ["lesson_01/lesson_01_seg_03.mp3"]:
            cues = [str(x["text"]) for x in block["timed_text"]]
            print(f"Block {i}: align seg_03 ({seg3.name}), {len(cues)} cues ...")
            aligned, total = align_voiceover_block(model, seg3, cues)
            block["total_audio_seconds"] = total
            block["timed_text"] = aligned
        else:
            print(f"Block {i}: skip (unexpected audio_files {files})", file=sys.stderr)

    dur_total = lesson_duration_seconds(blocks)
    lesson["duration_seconds"] = dur_total

    LESSON_JSON.write_text(
        json.dumps(lesson, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"Wrote {LESSON_JSON} (duration_seconds={dur_total})")

    payload = json.dumps({"blocks": blocks}, ensure_ascii=False)
    esc = escape_sql_json_string(payload)
    sql = "\n".join(
        [
            "-- Day 1: Whisper-aligned timed_text + total_audio_seconds from coach",
            "-- deliverable MP3s under content/audio/lesson_01/ (combined seg_01+02).",
            "",
            "begin;",
            "",
            "update public.lessons",
            f"set duration_seconds = {dur_total},",
            f"    content_blocks = '{esc}'::jsonb,",
            "    updated_at = now()",
            f"where id = '{LESSON_ID}';",
            "",
            "commit;",
            "",
        ]
    )
    OUT_MIGRATION.write_text(sql, encoding="utf-8")
    print(f"Wrote {OUT_MIGRATION}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
