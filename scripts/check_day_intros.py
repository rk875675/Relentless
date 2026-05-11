import json, os, glob
LESSON_DIR = r'c:\Users\rkuma\Relentless\content\lessons'
for path in sorted(glob.glob(os.path.join(LESSON_DIR, 'lesson_*.json'))):
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    for b in data['blocks']:
        if b['type'] != 'voiceover':
            continue
        cues = b.get('timed_text', [])
        if cues and cues[0]['start_s'] < 2.0:
            first = cues[0]
            print(f"{os.path.basename(path)}: [{first['start_s']}s] {first['text']!r}")
        break
