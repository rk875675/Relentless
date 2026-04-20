#!/usr/bin/env python3
"""
Align voiceover timed_text.start_s values to real audio using Whisper word timestamps.

The Relentless lesson player treats start_s as seconds from the beginning of the
first audio_files[] entry, cumulative across all segments in that voiceover block
(see content/DEVELOPER_IMPL_GUIDE.md — voiceover).

Inputs:
  - One or more MP3 paths (same order as content_blocks[].audio_files)
  - Verbatim timed_text[].text lines (order preserved)

Output:
  - JSON with timed_text (updated start_s), suggested total_audio_seconds, per-file durations

Requires:
  - ffmpeg/ffprobe on PATH (for durations; Whisper also needs ffmpeg at runtime)
  - pip install -r scripts/voiceover_align/requirements.txt

Example:
  python scripts/voiceover_align/align_voiceover.py ^
    --audio "content/audio/lesson_02/lesson_02_seg_01.mp3" ^
    --manifest voiceover_manifest.json

manifest.json (audio + cues together):
{
  "audio_files": ["lesson_02/lesson_02_seg_01.mp3"],
  "timed_text": [
    { "text": "Day 2." },
    { "text": "Today I want to show you the exact science." }
  ]
}

Or audio-only manifest + separate cues file:
  --manifest manifest_audio.json --timed-text-json cues.json
manifest_audio.json: { "audio_files": ["lesson_02/lesson_02_seg_01.mp3"] }
cues.json: [ { "text": "..." }, ... ]

Optional keys in manifest (defaults to CLI --audio list):
  "audio_files": ["lesson_02/lesson_02_seg_01.mp3"]
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Sequence


def expand_spoken_numbers(s: str) -> str:
    """Map bare digits to words so 'Day 3' matches Whisper 'day three'."""
    from num2words import num2words

    def repl(m: re.Match[str]) -> str:
        n = int(m.group(0))
        if 0 <= n <= 100:
            return str(num2words(n)).replace("-", " ")
        return m.group(0)

    return re.sub(r"\b\d+\b", repl, s)


def normalize_text(s: str) -> str:
    s = s.lower().strip()
    s = s.replace("\u2014", "-").replace("\u2013", "-")
    s = re.sub(r"[''`´]", "'", s)
    s = re.sub(r"[^\w\s'-]", " ", s)
    s = re.sub(r"\s+", " ", s).strip()
    s = expand_spoken_numbers(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def text_similarity(a: str, b: str) -> float:
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def blended_cue_score(cue_norm: str, frag: str) -> float:
    """Whole-window and tail-window similarity (coach phrasing often sits inside a longer ASR span)."""
    if not frag:
        return 0.0
    full = text_similarity(cue_norm, frag)
    tail_len = min(len(frag), max(len(cue_norm) * 3, 48))
    tail = frag[-tail_len:].strip()
    tail_score = text_similarity(cue_norm, tail) if tail else 0.0
    return max(full, tail_score)


@dataclass
class WordSpan:
    start_s: float
    end_s: float
    norm: str
    raw: str


def ffprobe_duration_seconds(path: Path) -> float | None:
    try:
        out = subprocess.check_output(
            [
                "ffprobe",
                "-v",
                "error",
                "-show_entries",
                "format=duration",
                "-of",
                "default=noprint_wrappers=1:nokey=1",
                str(path),
            ],
            stderr=subprocess.STDOUT,
            text=True,
        ).strip()
        return float(out)
    except (subprocess.CalledProcessError, FileNotFoundError, ValueError):
        return None


def collect_words_faster_whisper(
    model: object,
    audio_path: Path,
    time_offset_s: float,
    language: str | None,
) -> list[WordSpan]:
    kwargs: dict = {
        "word_timestamps": True,
        "vad_filter": True,
    }
    if language:
        kwargs["language"] = language

    segments, _info = model.transcribe(str(audio_path), **kwargs)
    words: list[WordSpan] = []
    for seg in segments:
        wlist = getattr(seg, "words", None) or []
        for w in wlist:
            raw = (w.word or "").strip()
            if not raw:
                continue
            nw = normalize_text(raw)
            if not nw:
                continue
            words.append(
                WordSpan(
                    start_s=float(w.start) + time_offset_s,
                    end_s=float(w.end) + time_offset_s,
                    norm=nw,
                    raw=raw,
                )
            )
    return words


def slice_norm_text(words: Sequence[WordSpan], i: int, j: int) -> str:
    """Inclusive-exclusive word indices i..j-1 joined."""
    return normalize_text(" ".join(words[k].raw for k in range(i, j)))


def best_window_for_cue(
    words: Sequence[WordSpan],
    cue_norm: str,
    start_idx: int,
    max_window_words: int,
    *,
    accept_score: float = 0.62,
) -> tuple[int, int, float] | None:
    """
    Find word window [i, j) with i >= start_idx that best matches cue_norm.

    Prefer the earliest start i where some window scores >= accept_score (avoids
    greedy over-consumption that skips the real phrase). If none, use the
    highest-scoring window from start_idx onward.
    """
    if not cue_norm:
        return (start_idx, start_idx, 1.0)

    n = len(words)
    min_words = max(1, len(cue_norm.split()) // 5)
    best_any: tuple[int, int, float] | None = None
    first_hit: tuple[int, int, float] | None = None

    for i in range(start_idx, n):
        lo = min_words
        hi = min(max_window_words + 1, n - i + 1)
        if lo >= hi:
            continue
        row_best: tuple[int, int, float] | None = None
        for wlen in range(lo, hi):
            j = i + wlen
            frag = slice_norm_text(words, i, j)
            if len(frag) < len(cue_norm) * 0.35 and wlen < max_window_words:
                continue
            score = blended_cue_score(cue_norm, frag)
            if row_best is None or score > row_best[2]:
                row_best = (i, j, score)
        if row_best is None:
            continue
        i0, j0, s0 = row_best
        if best_any is None or s0 > best_any[2]:
            best_any = row_best
        if s0 >= accept_score:
            if first_hit is None:
                first_hit = row_best
            elif i0 < first_hit[0] or (i0 == first_hit[0] and j0 < first_hit[1]):
                first_hit = row_best

    pick = first_hit or best_any
    if pick is None or pick[2] < 0.22:
        return None
    return pick


def snap_window_start(
    words: Sequence[WordSpan],
    i: int,
    j: int,
    cue_norm: str,
    *,
    max_scan: int = 55,
) -> tuple[int, int]:
    """If a long window was chosen (e.g. tail-boosted score), slide i right to maximize overlap with the cue."""
    if j - i <= 6 or not cue_norm:
        return i, j
    best_i = i
    best_sc = text_similarity(cue_norm, slice_norm_text(words, i, j))
    for i2 in range(i + 1, min(i + max_scan, j - 2)):
        sc = text_similarity(cue_norm, slice_norm_text(words, i2, j))
        if sc > best_sc + 0.008:
            best_i, best_sc = i2, sc
    return best_i, j


def spread_tail_duplicate_starts(aligned: list[dict], audio_duration: float) -> None:
    """
    When trailing cues collapse to the same start_s (alignment miss at end of file),
    space them evenly between the last distinct time and audio end so UI still advances.
    """
    if len(aligned) < 2:
        return
    tail_val = float(aligned[-1]["start_s"])
    k = len(aligned) - 2
    while k >= 0 and abs(float(aligned[k]["start_s"]) - tail_val) < 0.06:
        k -= 1
    first_dup = k + 1
    if first_dup >= len(aligned):
        return
    ndup = len(aligned) - first_dup
    if ndup <= 1:
        return
    t_prev = float(aligned[first_dup - 1]["start_s"])
    t_end = max(float(audio_duration) - 0.18, t_prev + 0.35)
    for idx in range(ndup):
        aligned[first_dup + idx]["start_s"] = round(
            t_prev + (t_end - t_prev) * (idx + 1) / (ndup + 1),
            3,
        )


def align_cues(
    words: Sequence[WordSpan],
    cues: Sequence[str],
    *,
    min_score: float,
    max_window_words: int,
) -> tuple[list[dict], list[str]]:
    out: list[dict] = []
    warnings: list[str] = []
    wi = 0
    for idx, cue in enumerate(cues):
        cue_norm = normalize_text(cue)
        match = best_window_for_cue(words, cue_norm, wi, max_window_words)
        if match is None:
            warnings.append(f"Cue {idx}: no match window — {cue[:80]!r}")
            if wi < len(words):
                fb = round(float(words[wi].start_s), 3)
            elif words:
                fb = round(float(words[-1].end_s), 3)
            else:
                fb = 0.0
            out.append({"start_s": fb, "text": cue})
            continue
        i, j, score = match
        i, j = snap_window_start(words, i, j, cue_norm)
        frag_used = slice_norm_text(words, i, j)
        score_report = max(score, blended_cue_score(cue_norm, frag_used))
        if score_report < min_score:
            warnings.append(
                f"Cue {idx}: low confidence ({score_report:.2f}) — {cue[:80]!r} "
                f"(words {i}-{j - 1}: {frag_used[:160]!r})"
            )
        start_s = words[i].start_s
        out.append({"start_s": round(float(start_s), 3), "text": cue})
        wi = j
    return out, warnings


def load_manifest(path: Path) -> dict:
    with path.open(encoding="utf-8") as f:
        return json.load(f)


def main() -> int:
    p = argparse.ArgumentParser(description="Align voiceover timed_text to Whisper timestamps.")
    p.add_argument(
        "--audio",
        action="append",
        dest="audio",
        help="Path to an audio file, in playback order (repeat flag or use manifest).",
    )
    p.add_argument(
        "--audio-base",
        type=Path,
        default=Path("content/audio"),
        help="Base directory when resolving manifest audio_files (default: content/audio).",
    )
    p.add_argument("--manifest", type=Path, help="JSON with timed_text and optional audio_files.")
    p.add_argument(
        "--timed-text-json",
        type=Path,
        help='Cue lines only: [{"text":"..."}] or ["..."] (use with --audio if no manifest).',
    )
    p.add_argument(
        "--model",
        default="base",
        help="faster-whisper model size or path (default: base). Try small/medium for harder audio.",
    )
    p.add_argument(
        "--device",
        default="cpu",
        help="cpu or cuda (default: cpu). Use cuda when GPU + drivers are available.",
    )
    p.add_argument("--language", default=None, help="Force ISO language code (e.g. en). Default: auto.")
    p.add_argument(
        "--min-score",
        type=float,
        default=0.55,
        help="Warn when best window similarity falls below this (default: 0.55).",
    )
    p.add_argument(
        "--max-window-words",
        type=int,
        default=80,
        help="Max words to include in a single cue window search (default: 80).",
    )
    args = p.parse_args()

    audio_paths: list[Path] = []
    cues: list[str] = []

    if args.manifest:
        m = load_manifest(args.manifest)
        rels = m.get("audio_files") or []
        if rels:
            audio_paths = [(args.audio_base / r).resolve() for r in rels]
        cues_obj = m.get("timed_text")
        if cues_obj is not None:
            if not isinstance(cues_obj, list) or not cues_obj:
                print("If present, manifest.timed_text must be a non-empty array", file=sys.stderr)
                return 2
            cues = []
            for row in cues_obj:
                if isinstance(row, dict) and "text" in row:
                    cues.append(str(row["text"]))
                else:
                    print("Each timed_text row must be an object with a text field", file=sys.stderr)
                    return 2

    if args.audio:
        audio_paths = [Path(a).resolve() for a in args.audio]

    if args.timed_text_json:
        raw = json.loads(args.timed_text_json.read_text(encoding="utf-8"))
        if not isinstance(raw, list) or not raw:
            print("--timed-text-json must be a non-empty JSON array", file=sys.stderr)
            return 2
        if isinstance(raw[0], str):
            next_cues = [str(x) for x in raw]
        else:
            next_cues = [str(x["text"]) for x in raw if isinstance(x, dict) and "text" in x]
        if len(next_cues) != len(raw):
            print("Each --timed-text-json row must be a string or {\"text\": ...}", file=sys.stderr)
            return 2
        cues = next_cues

    if not audio_paths:
        print("Provide --audio file(s) or manifest.audio_files plus --audio-base.", file=sys.stderr)
        return 2

    if not cues:
        print("No cues: use --manifest with timed_text or --timed-text-json.", file=sys.stderr)
        return 2

    for ap in audio_paths:
        if not ap.is_file():
            print(f"Audio not found: {ap}", file=sys.stderr)
            return 2

    try:
        from faster_whisper import WhisperModel
    except ImportError:
        print("Install deps: pip install -r scripts/voiceover_align/requirements.txt", file=sys.stderr)
        return 2

    device = args.device
    compute_type = "float16" if device == "cuda" else "int8"
    model = WhisperModel(args.model, device=device, compute_type=compute_type)

    all_words: list[WordSpan] = []
    file_meta: list[dict] = []
    offset = 0.0
    for ap in audio_paths:
        dur = ffprobe_duration_seconds(ap)
        words = collect_words_faster_whisper(model, ap, offset, args.language)
        all_words.extend(words)
        last_end = words[-1].end_s if words else offset
        meta = {
            "path": str(ap),
            "ffprobe_duration_s": round(dur, 3) if dur is not None else None,
            "last_whisper_word_end_s": round(last_end, 3),
            "word_count": len(words),
        }
        file_meta.append(meta)
        if dur is not None:
            offset += dur
        elif words:
            offset = last_end
        else:
            print(f"No words decoded for {ap}", file=sys.stderr)
            return 2

    aligned, warnings = align_cues(
        all_words,
        cues,
        min_score=args.min_score,
        max_window_words=args.max_window_words,
    )

    total_ffprobe = sum(m["ffprobe_duration_s"] or 0 for m in file_meta)
    if not total_ffprobe:
        total_ffprobe = round(all_words[-1].end_s, 3) if all_words else 0.0

    result = {
        "timed_text": aligned,
        "suggested_total_audio_seconds": round(total_ffprobe, 3) if total_ffprobe else None,
        "audio_durations": file_meta,
        "whisper_model": args.model,
    }

    print(json.dumps(result, indent=2, ensure_ascii=False))
    for w in warnings:
        print(w, file=sys.stderr)
    return 1 if any("no match" in x for x in warnings) else 0


if __name__ == "__main__":
    raise SystemExit(main())
