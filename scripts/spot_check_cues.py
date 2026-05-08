import json

for day in [15, 21, 28, 30]:
    path = fr'c:\Users\rkuma\Relentless\content\lessons\lesson_{day:02d}.json'
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    print(f"--- Day {day}: {data['title']} ---")
    for b in data['blocks']:
        if b['type'] != 'voiceover':
            continue
        for c in b['timed_text']:
            n = len(c['text'])
            flag = ' ***LONG***' if n > 120 else ''
            print(f"  [{c['start_s']:6.2f}s | {n:3d}c] {c['text'][:95]}{flag}")
    print()
