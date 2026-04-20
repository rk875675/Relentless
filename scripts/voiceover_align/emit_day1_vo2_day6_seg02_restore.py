"""Write supabase/migrations/20260419260000_restore_day6_seg02_script_day1_vo2_coach.sql"""
from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "supabase/migrations/20260419260000_restore_day6_seg02_script_day1_vo2_coach.sql"


def extract(sql: str, lesson_id: str) -> dict:
    key = f"where id = '{lesson_id}'"
    pos = sql.find(key)
    assert pos > 0, lesson_id
    chunk = sql[:pos]
    m = "content_blocks = '"
    start = chunk.rfind(m) + len(m)
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


def esc(s: str) -> str:
    return s.replace("'", "''")


def block_dur(b: dict) -> int:
    t = b["type"]
    if t == "voiceover":
        return int(round(float(b["total_audio_seconds"])))
    if t == "journal_prompt":
        return 60
    if t == "flash_cards":
        return len(b.get("cards") or []) * 25
    if t == "prompt_cards":
        return len(b.get("cards") or []) * 25
    if t == "multi_select":
        return 25
    if t == "examples_with_entry":
        return 45
    if t == "anchor_entry":
        return 45
    if t == "timed_exercise":
        if b.get("interactive_model"):
            d = int(b.get("duration_seconds") or 0)
            if b.get("interactive_model") == "box_breathing" and d > 0:
                return max(16, d)
            return d
        return len(b.get("steps") or []) * 5
    if t == "tap_through_text":
        return len(b.get("paragraphs") or []) * 4
    return int(b.get("duration_seconds") or 0)


def lesson_dur(blocks: list[dict]) -> int:
    return sum(block_dur(b) for b in blocks)


def main() -> None:
    d1 = extract(
        (ROOT / "supabase/migrations/20260419250000_fix_day1_vo1_restore_day6_trim_seg02.sql").read_text(
            encoding="utf-8"
        ),
        "d0000000-0000-0000-0000-000000000001",
    )
    for b in d1["blocks"]:
        if b.get("type") == "voiceover" and b.get("audio_files") == ["lesson_01/lesson_01_seg_03.mp3"]:
            b["total_audio_seconds"] = 26.0
            b["timed_text"] = [
                {"start_s": 0.0, "text": "Got your answer? Remember it."},
                {"start_s": 4.0, "text": "On Day 30 — I'm going to ask you again."},
                {"start_s": 9.0, "text": "Go ahead and hit the journal. One question. Be honest."},
                {"start_s": 15.0, "text": "After you finish — you'll officially complete Day 1."},
            ]
            break
    d1_dur = lesson_dur(d1["blocks"])

    d6 = extract(
        (ROOT / "supabase/migrations/20260419200000_align_wod_days_2_7_voiceover_timings.sql").read_text(
            encoding="utf-8"
        ),
        "d0000000-0000-0000-0000-000000000006",
    )
    for b in d6["blocks"]:
        if b.get("type") != "voiceover" or b.get("audio_files") != ["lesson_06/lesson_06_seg_02.mp3"]:
            continue
        tt = b["timed_text"]
        # Source migration stacked the last five cues within ~5s; merge into three spaced beats
        # using the same approved strings (concatenated), no paraphrase.
        if len(tt) >= 15:
            a, c, d, e = tt[10]["text"], tt[12]["text"], tt[13]["text"], tt[14]["text"]
            b["timed_text"] = tt[:10] + [
                {"start_s": 238.5, "text": f"{a} {tt[11]['text']}".strip()},
                {"start_s": 242.0, "text": c},
                {"start_s": 245.0, "text": f"{d} {e}".strip()},
            ]
        break
    d6_dur = lesson_dur(d6["blocks"])

    p1 = esc(json.dumps(d1, ensure_ascii=False))
    p6 = esc(json.dumps(d6, ensure_ascii=False))

    sql = "\n".join(
        [
            "-- Day 1: second voiceover (after flash cards) — restore coach-tuned timed_text",
            "-- + total_audio_seconds from 20260410000000_lesson1_flash_cards.sql (Whisper seg03",
            "-- did not match production pacing for the latter half).",
            "-- Day 6: restore lesson_06_seg_02 from 20260419200000 (approved script + aligned start_s).",
            "-- Last five cues were stacked in-source; merge tail into 3 beats with spaced start_s.",
            "-- Replaces ASR wall-of-text / triple-merge experiment.",
            "",
            "begin;",
            "",
            "update public.lessons",
            f"set duration_seconds = {d1_dur},",
            f"    content_blocks = '{p1}'::jsonb,",
            "    updated_at = now()",
            "where id = 'd0000000-0000-0000-0000-000000000001';",
            "",
            "update public.lessons",
            f"set duration_seconds = {d6_dur},",
            f"    content_blocks = '{p6}'::jsonb,",
            "    updated_at = now()",
            "where id = 'd0000000-0000-0000-0000-000000000006';",
            "",
            "commit;",
            "",
        ]
    )
    OUT.write_text(sql, encoding="utf-8")
    print("Wrote", OUT, "day1 dur", d1_dur, "day6 dur", d6_dur)


if __name__ == "__main__":
    main()
