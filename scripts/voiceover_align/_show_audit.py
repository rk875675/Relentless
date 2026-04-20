import json
import sys

r = json.load(open("scripts/voiceover_align/audit_voiceovers.out.json", encoding="utf-8"))
for day, lesson in r["lessons"].items():
    for vo in lesson["voiceovers"]:
        print(
            f"=== Day {day} block {vo['seg_index']} "
            f"(audio_files={vo['audio_files']}, total={vo['current_total_audio_seconds']}s, "
            f"cues={vo['current_cue_count']}) ==="
        )
        for iss in vo["audit"]["issues"]:
            print(f"  {iss}")
        print()
