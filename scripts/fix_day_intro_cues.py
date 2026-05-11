import json, os

LESSON_DIR = r'c:\Users\rkuma\Relentless\content\lessons'

FIXES = {
    18: 'Day 18.',
    19: 'Day 19. Today we do something different.',
    23: 'Day 23.',
}

for day, new_text in FIXES.items():
    path = os.path.join(LESSON_DIR, f'lesson_{day:02d}.json')
    with open(path, encoding='utf-8') as f:
        data = json.load(f)
    first_cue = data['blocks'][0]['timed_text'][0]
    old = first_cue['text']
    first_cue['text'] = new_text
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    print(f'Day {day}: {old!r} -> {new_text!r}')
