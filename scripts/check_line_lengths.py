import json, os
LESSON_DIR = r'c:\Users\rkuma\Relentless\content\lessons'
MAX_CHARS = 75
total_long = 0
for day in range(15, 31):
    path = os.path.join(LESSON_DIR, f'lesson_{day:02d}.json')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    for b in data['blocks']:
        if b['type'] != 'voiceover':
            continue
        for c in b['timed_text']:
            n = len(c['text'])
            if n > MAX_CHARS:
                total_long += 1
                print(f'Day {day} [{c["start_s"]}s | {n}c]: {c["text"][:72]}...')
print(f'Total remaining cues over {MAX_CHARS} chars: {total_long}')
