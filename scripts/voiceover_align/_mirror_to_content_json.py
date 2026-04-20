"""Update content/lessons/lesson_0[N].json files (Days 1-7) so that
duration_seconds, blocks[].timed_text, and blocks[].total_audio_seconds
match the latest migration (20260419280000_*)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_ALIGN = Path(__file__).resolve().parent
if str(_ALIGN) not in sys.path:
    sys.path.insert(0, str(_ALIGN))

from audit_voiceovers import LESSON_IDS, extract_content_blocks  # noqa: E402

NEW_SQL = (
    "supabase/migrations/"
    "20260420000000_day1_combined_audio_no_cumulative_offset.sql"
)


def main() -> int:
    sql_text = (_ROOT / NEW_SQL).read_text(encoding="utf-8")
    for day in [1, 2, 3, 4, 5, 6, 7]:
        # Day 6 block 2 was changed (merge_splits + clause-split). Other Day 6
        # blocks (1, 3) untouched but need the Day 6 block 2 update.
        try:
            data = extract_content_blocks(sql_text, LESSON_IDS[day])
        except ValueError:
            print(f"Day {day}: not in migration; skipping")
            continue

        json_path = _ROOT / f"content/lessons/lesson_0{day}.json"
        cur = json.loads(json_path.read_text(encoding="utf-8"))
        new_blocks = data["blocks"]

        # The static JSON content/lessons/lesson_0[N].json files are
        # informational; the DB (migration JSON) is authoritative. Some
        # JSONs use older schemas for non-voiceover blocks (e.g. lesson_02
        # uses a single timed_exercise instead of prompt_cards+multi_select).
        # We only mirror voiceover blocks here, matched by audio_files.
        new_vo_by_files: dict[tuple[str, ...], dict] = {}
        for nb in new_blocks:
            if nb.get("type") == "voiceover":
                key = tuple(nb.get("audio_files") or [])
                new_vo_by_files[key] = nb
        changed = False
        for cb in cur["blocks"]:
            if cb.get("type") != "voiceover":
                continue
            key = tuple(cb.get("audio_files") or [])
            nb = new_vo_by_files.get(key)
            if nb is None:
                print(
                    f"Day {day}: no migration match for voiceover "
                    f"audio_files={key}; leaving cue as-is"
                )
                continue
            cb["timed_text"] = nb["timed_text"]
            cb["total_audio_seconds"] = nb["total_audio_seconds"]
            changed = True

        if not changed:
            print(f"Day {day}: no voiceover blocks updated; skipping write")
            continue

        # Compute lesson duration to match migration value: just use the
        # migration's recompute approach by trusting block fields.
        # But the JSON file's duration_seconds is a static field. Let's read
        # the migration's duration_seconds string and match it.
        marker = f"where id = '{LESSON_IDS[day]}'"
        pos = sql_text.find(marker)
        chunk = sql_text[:pos]
        m = "set duration_seconds = "
        i = chunk.rfind(m) + len(m)
        comma_pos = chunk.find(",", i)
        dur = int(chunk[i:comma_pos].strip())
        cur["duration_seconds"] = dur

        json_path.write_text(
            json.dumps(cur, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        print(f"Day {day}: wrote {json_path} (duration_seconds={dur})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
