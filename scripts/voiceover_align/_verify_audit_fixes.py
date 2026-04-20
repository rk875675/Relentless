"""Re-run audit logic against cues in 20260419280000 to confirm zero issues."""
from __future__ import annotations

import json
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[2]
_ALIGN = Path(__file__).resolve().parent
if str(_ALIGN) not in sys.path:
    sys.path.insert(0, str(_ALIGN))

from audit_voiceovers import LESSON_IDS, audit_cues, extract_content_blocks  # noqa: E402

NEW_SQL = (
    "supabase/migrations/"
    "20260419280000_voiceover_one_sentence_per_cue_audit_fixes.sql"
)
DAYS_2_7_SQL = (
    "supabase/migrations/20260419200000_align_wod_days_2_7_voiceover_timings.sql"
)


def main() -> int:
    sql_text = (_ROOT / NEW_SQL).read_text(encoding="utf-8")
    base_sql = (_ROOT / DAYS_2_7_SQL).read_text(encoding="utf-8")

    total_issues = 0
    for day in [1, 2, 3, 4, 5, 6, 7]:
        try:
            data = extract_content_blocks(sql_text, LESSON_IDS[day])
        except ValueError:
            data = extract_content_blocks(base_sql, LESSON_IDS[day])
        block_idx = 0
        for b in data["blocks"]:
            if b.get("type") != "voiceover":
                continue
            block_idx += 1
            cues = b.get("timed_text") or []
            tas = float(b.get("total_audio_seconds") or 0.0)
            audit = audit_cues(cues, tas)
            kinds = [i["kind"] for i in audit["issues"]]
            tally = {k: kinds.count(k) for k in sorted(set(kinds))}
            total_issues += audit["issue_count"]
            mark = "OK" if audit["issue_count"] == 0 else "FAIL"
            print(
                f"Day {day} block {block_idx}: {len(cues)} cues, "
                f"{audit['issue_count']} issues {tally} {mark}"
            )
            if audit["issue_count"] > 0:
                for iss in audit["issues"]:
                    print(f"   {iss}")
    print(f"\nTOTAL ISSUES: {total_issues}")
    return 0 if total_issues == 0 else 1


if __name__ == "__main__":
    raise SystemExit(main())
