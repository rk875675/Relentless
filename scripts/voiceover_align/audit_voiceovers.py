#!/usr/bin/env python3
"""
Audit every WOD voiceover (Days 1-7) for on-screen text quality:

  - GAP: idle screen (consecutive cues > MAX_GAP_S apart)
  - MULTI: cue text contains multiple sentences (violates "1 sentence at a time")
  - SPLIT: a single sentence is split across two consecutive cues (next cue
    starts lowercase OR previous cue text doesn't end with .!?)
  - LONG: cue text exceeds MAX_CHARS

Also Whisper-transcribes each MP3 (segment-level, VAD) so we can compare/
replace cues with verbatim ASR if needed.

Reads current cues from the latest committed migrations:
  - Day 1, Day 6:  20260419270000_restore_whisper_day1_vo1_day6_seg01_split_seg02.sql
  - Days 2,3,4,5,7: 20260419200000_align_wod_days_2_7_voiceover_timings.sql

Writes audit JSON to:  scripts/voiceover_align/audit_voiceovers.out.json

No SQL/DB changes are made by this script.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Iterable

_ROOT = Path(__file__).resolve().parents[2]
_ALIGN = Path(__file__).resolve().parent
if str(_ALIGN) not in sys.path:
    sys.path.insert(0, str(_ALIGN))

from align_voiceover import ffprobe_duration_seconds  # noqa: E402


MAX_GAP_S = 18.0
MAX_CHARS = 150

LESSON_IDS = {
    1: "d0000000-0000-0000-0000-000000000001",
    2: "d0000000-0000-0000-0000-000000000002",
    3: "d0000000-0000-0000-0000-000000000003",
    4: "d0000000-0000-0000-0000-000000000004",
    5: "d0000000-0000-0000-0000-000000000005",
    6: "d0000000-0000-0000-0000-000000000006",
    7: "d0000000-0000-0000-0000-000000000007",
}

DAY1_DAY6_SQL = (
    "supabase/migrations/"
    "20260419270000_restore_whisper_day1_vo1_day6_seg01_split_seg02.sql"
)
DAYS_2_7_SQL = (
    "supabase/migrations/20260419200000_align_wod_days_2_7_voiceover_timings.sql"
)


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


def load_lesson_blocks(day: int) -> list[dict]:
    src = DAY1_DAY6_SQL if day in (1, 6) else DAYS_2_7_SQL
    sql = (_ROOT / src).read_text(encoding="utf-8")
    data = extract_content_blocks(sql, LESSON_IDS[day])
    return data["blocks"]


_SENT_END_RE = re.compile(r"[.!?][\")\]]?\s")


def split_sentences(text: str) -> list[str]:
    """Split into sentences. Handles plain '.', '?', '!'. Keeps closing punct."""
    out: list[str] = []
    buf = ""
    i = 0
    n = len(text)
    while i < n:
        buf += text[i]
        if text[i] in ".!?":
            j = i + 1
            while j < n and text[j] in '")]':
                buf += text[j]
                j += 1
            if j >= n or text[j] == " ":
                s = buf.strip()
                if s:
                    out.append(s)
                buf = ""
                i = j
                continue
        i += 1
    s = buf.strip()
    if s:
        out.append(s)
    return out


def cue_ends_with_terminal_punct(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    return t[-1] in '.!?"\'\u201d\u2019)]'


def cue_starts_lowercase_word(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    if t[0].isupper():
        return False
    return t[0].isalpha()


def audit_cues(
    cues: list[dict],
    total_audio_s: float,
) -> dict:
    issues: list[dict] = []
    for i, cue in enumerate(cues):
        text = str(cue.get("text", ""))
        sents = split_sentences(text)
        if len(sents) > 1:
            issues.append(
                {
                    "kind": "MULTI",
                    "cue_idx": i,
                    "start_s": cue.get("start_s"),
                    "n_sentences": len(sents),
                    "text": text,
                }
            )
        if len(text) > MAX_CHARS:
            issues.append(
                {
                    "kind": "LONG",
                    "cue_idx": i,
                    "start_s": cue.get("start_s"),
                    "chars": len(text),
                    "text": text,
                }
            )
        if i + 1 < len(cues):
            nxt = cues[i + 1]
            gap = float(nxt.get("start_s", 0)) - float(cue.get("start_s", 0))
            if gap > MAX_GAP_S:
                issues.append(
                    {
                        "kind": "GAP",
                        "cue_idx": i,
                        "start_s": cue.get("start_s"),
                        "next_start_s": nxt.get("start_s"),
                        "gap_s": round(gap, 2),
                        "text": text,
                    }
                )
            if (
                not cue_ends_with_terminal_punct(text)
                or cue_starts_lowercase_word(str(nxt.get("text", "")))
            ):
                issues.append(
                    {
                        "kind": "SPLIT",
                        "cue_idx": i,
                        "start_s": cue.get("start_s"),
                        "next_start_s": nxt.get("start_s"),
                        "this_text": text,
                        "next_text": nxt.get("text"),
                    }
                )
    if cues:
        last = cues[-1]
        tail = float(total_audio_s) - float(last.get("start_s", 0))
        if tail > MAX_GAP_S:
            issues.append(
                {
                    "kind": "TAIL_GAP",
                    "cue_idx": len(cues) - 1,
                    "start_s": last.get("start_s"),
                    "audio_end_s": round(float(total_audio_s), 2),
                    "tail_s": round(tail, 2),
                    "text": last.get("text"),
                }
            )
    return {"issue_count": len(issues), "issues": issues}


def whisper_segments(model: object, mp3: Path) -> list[dict]:
    segments, _info = model.transcribe(str(mp3), language="en", vad_filter=True)
    out: list[dict] = []
    for seg in segments:
        t = (seg.text or "").strip()
        if not t:
            continue
        out.append(
            {
                "start_s": round(float(seg.start), 3),
                "end_s": round(float(seg.end), 3),
                "text": t,
            }
        )
    return out


def local_mp3(audio_root: Path, day: int, seg_idx_1based: int) -> Path:
    if day == 1:
        # Day 1 lives in its own LESSON 1 folder
        return audio_root.parent / "LESSON 1" / f"L1S{seg_idx_1based}.mp3"
    if day == 6:
        return audio_root / f"L6S{seg_idx_1based}rev.mp3"
    return audio_root / f"L{day}S{seg_idx_1based}.mp3"


def voiceover_blocks_with_audio(
    blocks: list[dict],
    day: int,
    audio_root: Path,
) -> Iterable[tuple[int, dict, Path]]:
    seg = 0
    for b in blocks:
        if b.get("type") != "voiceover":
            continue
        seg += 1
        yield seg, b, local_mp3(audio_root, day, seg)


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
        "--out",
        type=Path,
        default=Path("scripts/voiceover_align/audit_voiceovers.out.json"),
    )
    p.add_argument(
        "--days",
        default="1,2,3,4,5,6,7",
        help="Comma-separated list of days to audit.",
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

    days = [int(x) for x in args.days.split(",") if x.strip()]
    report: dict = {
        "max_gap_s": MAX_GAP_S,
        "max_chars": MAX_CHARS,
        "lessons": {},
    }

    for day in days:
        try:
            blocks = load_lesson_blocks(day)
        except Exception as exc:  # noqa: BLE001
            print(f"Day {day}: load error: {exc}", file=sys.stderr)
            continue
        lesson_report: dict = {"voiceovers": []}
        for seg_i, block, mp3 in voiceover_blocks_with_audio(blocks, day, audio_root):
            cues = block.get("timed_text") or []
            tas = float(block.get("total_audio_seconds") or 0.0)
            audit = audit_cues(cues, tas)
            mp3_exists = mp3.is_file()
            seg_entry: dict = {
                "seg_index": seg_i,
                "audio_files": block.get("audio_files"),
                "mp3_path": str(mp3),
                "mp3_exists": mp3_exists,
                "current_total_audio_seconds": tas,
                "current_cue_count": len(cues),
                "audit": audit,
            }
            if mp3_exists:
                dur = ffprobe_duration_seconds(mp3)
                segs = whisper_segments(model, mp3)
                seg_entry["ffprobe_duration_s"] = (
                    round(float(dur), 3) if dur is not None else None
                )
                seg_entry["whisper_segments"] = segs
                seg_entry["whisper_segment_count"] = len(segs)
            print(
                f"Day {day} seg {seg_i} ({mp3.name}): "
                f"{len(cues)} cues, {audit['issue_count']} issues"
            )
            lesson_report["voiceovers"].append(seg_entry)
        report["lessons"][str(day)] = lesson_report

    out_path = (_ROOT / args.out).resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nWrote {out_path}")

    print("\n--- ISSUE SUMMARY ---")
    for day_str, lesson in report["lessons"].items():
        for vo in lesson["voiceovers"]:
            seg_i = vo["seg_index"]
            issues = vo["audit"]["issues"]
            kinds = [i["kind"] for i in issues]
            tally = {k: kinds.count(k) for k in sorted(set(kinds))}
            if tally:
                print(f"Day {day_str} seg {seg_i}: {tally}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
