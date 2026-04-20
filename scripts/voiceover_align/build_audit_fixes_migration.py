#!/usr/bin/env python3
"""
Build supabase migration 20260419280000_*.sql that fixes voiceover timed_text
issues flagged by audit_voiceovers.py:

  - GAP (idle on-screen text > 18s):         whisper_full strategy
  - MULTI (multiple sentences per cue):      split_multi strategy
  - SPLIT (sentence broken across cues):     merge_splits strategy
  - LONG (cue > MAX_CHARS):                  inherited via whisper_full / split_multi

Per-block plan (derived from running audit_voiceovers.py):

  Day 1 b1: whisper_full (2 GAPs)
  Day 1 b2: split_multi  (2 MULTIs)
  Day 2 b1: whisper_full (2 GAPs + 3 MULTIs)
  Day 2 b2: split_multi  (1 MULTI)
  Day 3 b1: split_multi  (2 MULTIs)
  Day 3 b2: split_multi  (1 MULTI)
  Day 4 b1: whisper_full (1 GAP + 4 MULTIs)
  Day 4 b2: split_multi  (2 MULTIs)
  Day 5 b1: whisper_full (1 GAP + 5 MULTIs)
  Day 5 b2: split_multi  (1 MULTI)
  Day 6 b1: untouched
  Day 6 b2: merge_splits (5 SPLITs)
  Day 6 b3: untouched
  Day 7 b1: split_multi  (2 MULTIs)
  Day 7 b2: split_multi  (1 MULTI)

whisper_full: transcribe entire VO, take Whisper segments (with word-level
timestamps), then merge any consecutive segments forming a single sentence
(SPLIT) and split any segment containing multiple sentences (MULTI).

split_multi: keep curated cue text but for any multi-sentence cue, split into
N single-sentence cues and re-align the new cue list against Whisper words
using the existing align_cues helper.

merge_splits: walk the cue list; if cue[i] doesn't end with terminal
punctuation OR cue[i+1] starts mid-sentence (lowercase or known mid-sentence
connector), merge cue[i+1] into cue[i].
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_ALIGN = Path(__file__).resolve().parent
if str(_ALIGN) not in sys.path:
    sys.path.insert(0, str(_ALIGN))

from align_voiceover import (  # noqa: E402
    WordSpan,
    align_cues,
    collect_words_faster_whisper,
    ffprobe_duration_seconds,
    spread_tail_duplicate_starts,
)


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
OUT_MIGRATION = (
    "supabase/migrations/"
    "20260419280000_voiceover_one_sentence_per_cue_audit_fixes.sql"
)

PER_BLOCK_PLAN: dict[int, dict[int, str]] = {
    1: {1: "whisper_full", 2: "split_multi"},
    2: {1: "whisper_full", 2: "split_multi"},
    3: {1: "split_multi", 2: "split_multi"},
    4: {1: "whisper_full", 2: "split_multi"},
    5: {1: "whisper_full", 2: "split_multi"},
    6: {2: "merge_splits"},
    7: {1: "split_multi", 2: "split_multi"},
}


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


def local_mp3(audio_root: Path, day: int, seg_1based: int) -> Path:
    if day == 1:
        return audio_root.parent / "LESSON 1" / f"L1S{seg_1based}.mp3"
    if day == 6:
        return audio_root / f"L6S{seg_1based}rev.mp3"
    return audio_root / f"L{day}S{seg_1based}.mp3"


# -------- helpers ---------------------------------------------------------


_TERMINAL = ".!?\u2026\u201d\u2019\")]"
_MID_SENT_CONNECTORS = {
    "and",
    "or",
    "but",
    "as",
    "so",
    "let",
    "your",
    "the",
    "a",
    "to",
    "of",
    "in",
    "on",
    "at",
    "for",
    "with",
    "from",
    "into",
    "through",
}


def cue_ends_terminal(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    return t[-1] in _TERMINAL


def starts_midsentence(text: str) -> bool:
    t = text.strip()
    if not t:
        return False
    if t[0].isupper():
        return False
    if t[0].isalpha():
        return True
    return False


def split_text_into_sentences(text: str) -> list[str]:
    """Split a string into sentences, keeping terminating punctuation."""
    out: list[str] = []
    buf = ""
    i = 0
    n = len(text)
    while i < n:
        buf += text[i]
        if text[i] in ".!?":
            j = i + 1
            while j < n and text[j] in '")]\u201d\u2019':
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


def merge_split_cues(cues: list[dict]) -> list[dict]:
    """Merge consecutive cues that form a single sentence."""
    out: list[dict] = []
    for cue in cues:
        text = str(cue.get("text", "")).strip()
        if (
            out
            and (
                not cue_ends_terminal(out[-1]["text"])
                or starts_midsentence(text)
            )
        ):
            out[-1]["text"] = (out[-1]["text"].rstrip() + " " + text).strip()
            continue
        out.append({"start_s": float(cue["start_s"]), "text": text})
    return out


_CLAUSE_SEPS: tuple[tuple[str, float], ...] = (
    # (separator, preference weight - lower is preferred when distances tie)
    ("; ", 0.0),
    (" \u2014 ", 0.1),  # em-dash
    (" - ", 0.15),
    (", ", 0.2),
    (" and ", 0.4),
    (" but ", 0.4),
    (" or ", 0.45),
    (" so ", 0.5),
    (" because ", 0.5),
)


def _best_clause_split(text: str) -> int | None:
    """Return character index where split should occur (start of part 2 text),
    or None if no good split is available."""
    n = len(text)
    if n < 40:
        return None
    midpoint = n / 2
    candidates: list[tuple[float, int, str]] = []
    for sep, pref in _CLAUSE_SEPS:
        pos = 0
        while True:
            i = text.find(sep, pos)
            if i < 0:
                break
            # avoid splits very close to either end
            if i < n * 0.18 or i > n * 0.82:
                pos = i + 1
                continue
            distance_norm = abs(i - midpoint) / midpoint
            score = distance_norm + pref * 0.6
            candidates.append((score, i, sep))
            pos = i + 1
    if not candidates:
        return None
    candidates.sort()
    _, split_at, sep = candidates[0]
    return split_at + len(sep)


def split_long_cues_at_clause(
    cues: list[dict],
    total_audio_s: float,
    max_chars: int,
) -> list[dict]:
    """Recursively split cues longer than max_chars at natural clause boundaries.
    Interpolates start_s proportionally based on character position."""
    out: list[dict] = []
    for i, cue in enumerate(cues):
        text = str(cue["text"]).strip()
        start = float(cue["start_s"])
        nxt_start = (
            float(cues[i + 1]["start_s"])
            if i + 1 < len(cues)
            else float(total_audio_s)
        )
        if nxt_start <= start:
            nxt_start = start + max(1.0, len(text) / 18.0)
        if len(text) <= max_chars:
            out.append({"start_s": round(start, 3), "text": text})
            continue
        # Recursively clause-split this single cue.
        chunks: list[tuple[float, str]] = [(start, text)]
        chunk_end = nxt_start
        i_chunk = 0
        while i_chunk < len(chunks):
            ch_start, ch_text = chunks[i_chunk]
            if len(ch_text) <= max_chars:
                i_chunk += 1
                continue
            split_at = _best_clause_split(ch_text)
            if split_at is None:
                i_chunk += 1
                continue
            part1 = ch_text[:split_at].rstrip(" ,;\u2014-")
            part2 = ch_text[split_at:].lstrip()
            if not part1 or not part2:
                i_chunk += 1
                continue
            # Interpolate part2 start time proportionally between ch_start and
            # chunk_end (the next outer cue's start).
            local_end = (
                chunks[i_chunk + 1][0]
                if i_chunk + 1 < len(chunks)
                else chunk_end
            )
            ratio = len(part1) / (len(part1) + len(part2))
            part2_start = ch_start + (local_end - ch_start) * ratio
            chunks[i_chunk] = (ch_start, part1)
            chunks.insert(i_chunk + 1, (part2_start, part2))
        for cs, ct in chunks:
            out.append({"start_s": round(float(cs), 3), "text": ct})
    return out


# -------- whisper transcribe (segment + word) -----------------------------


def transcribe_segments_with_words(
    model: object,
    mp3_paths: list[Path],
) -> tuple[list[dict], float]:
    """Return (segments, total_duration). Each segment: {start_s, end_s, text, words[]}.
    Times are cumulative across all mp3_paths (in order)."""
    all_segs: list[dict] = []
    offset = 0.0
    total = 0.0
    for ap in mp3_paths:
        dur = ffprobe_duration_seconds(ap)
        segments, _info = model.transcribe(
            str(ap),
            language="en",
            vad_filter=True,
            word_timestamps=True,
        )
        for seg in segments:
            text = (seg.text or "").strip()
            if not text:
                continue
            words_raw = getattr(seg, "words", None) or []
            words: list[dict] = []
            for w in words_raw:
                wt = (w.word or "").strip()
                if not wt:
                    continue
                words.append(
                    {
                        "word": w.word,
                        "start_s": float(w.start) + offset,
                        "end_s": float(w.end) + offset,
                    }
                )
            all_segs.append(
                {
                    "start_s": float(seg.start) + offset,
                    "end_s": float(seg.end) + offset,
                    "text": text,
                    "words": words,
                }
            )
        if dur is not None:
            offset += dur
            total += dur
        elif words:
            offset = words[-1]["end_s"]
            total = offset
    return all_segs, round(total, 3)


def split_segment_by_sentence_words(seg: dict) -> list[dict]:
    """Walk a segment's word list; emit a new cue every time a word ends in .!?
    Falls back to a single cue if word timestamps are missing."""
    words = seg.get("words") or []
    if not words:
        return [{"start_s": round(float(seg["start_s"]), 3), "text": seg["text"].strip()}]

    cues: list[dict] = []
    cur: list[dict] = []
    for w in words:
        cur.append(w)
        wt = (w["word"] or "").strip()
        if not wt:
            continue
        if wt[-1] in _TERMINAL:
            text = "".join(x["word"] for x in cur).strip()
            cues.append(
                {"start_s": round(float(cur[0]["start_s"]), 3), "text": text}
            )
            cur = []
    if cur:
        text = "".join(x["word"] for x in cur).strip()
        cues.append({"start_s": round(float(cur[0]["start_s"]), 3), "text": text})
    return cues


def whisper_full(model: object, mp3_paths: list[Path]) -> tuple[list[dict], float]:
    segs, total = transcribe_segments_with_words(model, mp3_paths)
    if not segs:
        raise RuntimeError(f"No Whisper segments for {mp3_paths}")

    # Phase 1: split any multi-sentence segment into single-sentence cues.
    split_cues: list[dict] = []
    for seg in segs:
        sents = split_text_into_sentences(seg["text"])
        if len(sents) <= 1:
            split_cues.append(
                {"start_s": round(float(seg["start_s"]), 3), "text": seg["text"].strip()}
            )
            continue
        for sub in split_segment_by_sentence_words(seg):
            split_cues.append(sub)

    # Phase 2: merge any cue that doesn't terminate with the next cue if next
    # starts mid-sentence (handles VAD breaks across one long sentence).
    merged = merge_split_cues(split_cues)
    spread_tail_duplicate_starts(merged, total)
    return merged, total


# -------- split_multi (keep curated text, split multi-sentence cues) -----


def expand_curated_cues_to_sentences(cues: list[dict]) -> list[str]:
    """Return a flat list of sentence-strings, splitting any multi-sentence
    cue text into separate strings while preserving order."""
    out: list[str] = []
    for cue in cues:
        text = str(cue.get("text", "")).strip()
        sents = split_text_into_sentences(text)
        if len(sents) <= 1:
            out.append(text)
        else:
            out.extend(sents)
    return out


def split_multi_curated(
    model: object,
    mp3_paths: list[Path],
    original_cues: list[dict],
) -> list[dict]:
    """Re-align curated cues with each multi-sentence cue split into N
    single-sentence cues, using existing align_cues against Whisper words."""
    flat = expand_curated_cues_to_sentences(original_cues)

    all_words: list[WordSpan] = []
    offset = 0.0
    total = 0.0
    for ap in mp3_paths:
        dur = ffprobe_duration_seconds(ap)
        words = collect_words_faster_whisper(model, ap, offset, "en")
        if not words:
            raise RuntimeError(f"No Whisper words for {ap}")
        all_words.extend(words)
        last_end = words[-1].end_s if words else offset
        if dur is not None:
            offset += dur
            total += dur
        else:
            offset = last_end
            total = last_end

    aligned, warns = align_cues(
        all_words,
        flat,
        min_score=0.42,
        max_window_words=80,
    )
    for w in warns:
        print(f"  WARN split_multi: {w}", file=sys.stderr)
    spread_tail_duplicate_starts(aligned, float(total))
    return aligned


# -------- per-block dispatch ---------------------------------------------


def apply_plan(
    model: object,
    audio_root: Path,
    day: int,
    plan: dict[int, str],
) -> tuple[list[dict], int]:
    blocks = load_lesson_blocks(day)
    block_idx = 0
    audio_cursor = 0
    for b in blocks:
        if b.get("type") != "voiceover":
            continue
        block_idx += 1
        n_audio = len(b.get("audio_files") or [])
        block_audio_segs = list(range(audio_cursor + 1, audio_cursor + 1 + n_audio))
        audio_cursor += n_audio
        action = plan.get(block_idx)
        if not action:
            continue
        mp3_paths = [local_mp3(audio_root, day, k) for k in block_audio_segs]
        for mp3 in mp3_paths:
            if not mp3.is_file():
                raise FileNotFoundError(mp3)
        if action == "whisper_full":
            cues, total_s = whisper_full(model, mp3_paths)
            b["timed_text"] = cues
            b["total_audio_seconds"] = round(float(total_s), 3)
        elif action == "split_multi":
            cues = split_multi_curated(model, mp3_paths, b["timed_text"])
            b["timed_text"] = cues
        elif action == "merge_splits":
            new_cues = merge_split_cues(b["timed_text"])
            b["timed_text"] = new_cues
        else:
            raise ValueError(f"unknown action: {action}")
        # Post-pass: split any remaining cue > MAX_CHARS at clause boundaries.
        # Limit chosen to keep on-screen text scannable in ~5-8 seconds.
        post = split_long_cues_at_clause(
            b["timed_text"],
            float(b.get("total_audio_seconds") or 0.0),
            max_chars=150,
        )
        b["timed_text"] = post
        print(
            f"  Day {day} block {block_idx}: {action} -> "
            f"{len(post)} cues"
        )
    dur = lesson_duration_seconds(blocks)
    return blocks, dur


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
    for day in sorted(PER_BLOCK_PLAN.keys()):
        print(f"--- Day {day} ---")
        blocks, dur = apply_plan(model, audio_root, day, PER_BLOCK_PLAN[day])
        updates.append((day, blocks, dur))

    out_lines = [
        "-- Voiceover audit fixes (run by audit_voiceovers.py + build_audit_fixes_migration.py):",
        "--   * Eliminate idle on-screen text (cue gaps > 18s) by replacing the",
        "--     entire timed_text with a verbatim Whisper transcript for the",
        "--     affected blocks (Day 1 b1, Day 2 b1, Day 4 b1, Day 5 b1).",
        "--   * Split every multi-sentence cue into single-sentence cues with",
        "--     Whisper-aligned start_s for the remaining MULTI-only blocks",
        "--     (Day 1 b2, Day 2 b2, Day 3 b1/b2, Day 4 b2, Day 5 b2,",
        "--     Day 7 b1/b2).",
        "--   * Merge Day 6 lesson_06_seg_02.mp3 cues that broke a single",
        "--     sentence across two on-screen lines (5 SPLIT issues).",
        "--   * Day 6 lesson_06_seg_01 / seg_03 unchanged (already 1 sentence",
        "--     per cue with no idle gaps).",
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
