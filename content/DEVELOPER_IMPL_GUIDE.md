# Developer Implementation Guide — Library Lessons

How to ship a new library lesson in ~10 minutes.

---

## 1. Quick-start checklist

1. Pick the next available UUID + sort_order from the registry below
2. Copy `content/templates/library_lesson_template.json` → fill in content
3. Copy `content/templates/library_lesson_migration_template.sql` → fill in placeholders
4. `supabase db push`
5. Done — lesson appears in the Library tab immediately

---

## 2. UUID + sort_order registry

UUIDs are deterministic so they can be hardcoded in seeds and cross-referenced
anywhere. Use the next available row in each category.

### Mindfulness (e1…)

| Lesson         | UUID                                   | sort_order | Status  |
|----------------|----------------------------------------|------------|---------|
| M-01 Short     | `e1000000-0000-0000-0000-000000000001` | 100        | ✅ DONE |
| M-01 Long      | `e1000000-0000-0000-0000-000000000002` | 101        | —       |
| M-02 Short     | `e1000000-0000-0000-0000-000000000003` | 110        | ✅ DONE |
| M-02 Long      | `e1000000-0000-0000-0000-000000000004` | 111        | —       |
| M-03 Short     | `e1000000-0000-0000-0000-000000000005` | 120        | ✅ DONE |
| M-03 Long      | `e1000000-0000-0000-0000-000000000006` | 121        | —       |
| M-04 Short     | `e1000000-0000-0000-0000-000000000007` | 130        | ✅ DONE |
| M-04 Long      | `e1000000-0000-0000-0000-000000000008` | 131        | —       |
| M-05 Short     | `e1000000-0000-0000-0000-000000000009` | 140        | ✅ DONE |
| M-05 Long      | `e1000000-0000-0000-0000-000000000010` | 141        | —       |

### Acceptance (e2…)

| Lesson         | UUID                                   | sort_order | Status  |
|----------------|----------------------------------------|------------|---------|
| A-01 Short     | `e2000000-0000-0000-0000-000000000001` | 200        | —       |
| A-01 Long      | `e2000000-0000-0000-0000-000000000002` | 201        | —       |
| A-02 Short     | `e2000000-0000-0000-0000-000000000003` | 210        | —       |
| A-02 Long      | `e2000000-0000-0000-0000-000000000004` | 211        | —       |

### Commitment (e3…)

| Lesson         | UUID                                   | sort_order | Status  |
|----------------|----------------------------------------|------------|---------|
| C-01 Short     | `e3000000-0000-0000-0000-000000000001` | 300        | —       |
| C-01 Long      | `e3000000-0000-0000-0000-000000000002` | 301        | —       |
| C-02 Short     | `e3000000-0000-0000-0000-000000000003` | 310        | —       |
| C-02 Long      | `e3000000-0000-0000-0000-000000000004` | 311        | —       |

**Sort order pattern:**
- Category ranges: M=100s, A=200s, C=300s
- Within category: Short/Long pairs at 10-increments (100/101, 110/111, 120/121…)

---

## 3. Block type reference

All supported block types. Library lessons currently use `tap_through_text`
instead of `voiceover` (no recorded audio needed). See Section 4 for the
full JSON template with every block type shown.

### `tap_through_text`
User taps or swipes through paragraphs one at a time. Ambient music plays.
Swipe left = next, swipe right = back, tap = next. Last paragraph shows
"Begin Exercise" and advances to the next block.

```json
{
  "type": "tap_through_text",
  "ambient_audio": "ambient/ambient_music.mp3",
  "paragraphs": [
    "First paragraph shown on screen.",
    "Second paragraph shown after tap.",
    "And so on — 3 to 7 paragraphs is ideal."
  ]
}
```

- Keep each paragraph to 1–2 sentences max (readable at a glance)
- 3–7 paragraphs is the sweet spot; beyond 7 gets long
- `ambient_audio` is optional but strongly recommended

### `timed_exercise` — standard
Text-step exercise. Steps advance automatically on a timer.

**What the user sees:**
- For breath models (`coffee_breath`, `milk_breath`, `whiskey_breath`): animated
  circle + exercise card. The card shows `steps[].text` as the main coaching
  text, with a small auto-derived `INHALE / EXHALE` label at the top of the
  card (no content work needed — the app computes it from elapsed time + model).
- For non-circle models (e.g. `body_scan`): zone dots + exercise card with
  `steps[].text`. No phase label.
- For the fallback (no `interactive_model`): step-progress dots + card text.

Keep `steps[].text` **phase-neutral coaching copy** (not "inhale now" / "exhale
now" — the auto phase label already handles that for breath models).

```json
{
  "type": "timed_exercise",
  "duration_seconds": 60,
  "ambient_audio": "ambient/ambient_music.mp3",
  "interactive_model": "coffee_breath",
  "steps": [
    { "text": "Keep pace. Don't slow down.", "duration_seconds": 10 },
    { "text": "Fast in, fast out. Stay with it.", "duration_seconds": 10 },
    { "text": "You're firing up your nervous system right now.", "duration_seconds": 10 },
    { "text": "You may feel a tingle. That's the shift happening.", "duration_seconds": 10 },
    { "text": "Stay sharp. You're almost there.", "duration_seconds": 10 },
    { "text": "Feel the difference. That's intensity on demand.", "duration_seconds": 10 }
  ]
}
```

- `duration_seconds` must equal the sum of all step durations
- Each step is 10 s for all M library breath models (matches the coaching pace)
- `ambient_audio` is optional

### `timed_exercise` — box breathing (interactive circle)
Animated circle pulses with the breath. Use `interactive_model: "box_breathing"`.

**What the user sees:**
- Animated breath circle with a 4→1 countdown inside
- Exercise card showing the current `visual_cues` phrase (changes every 10 s)
- A small `INHALE / HOLD / EXHALE / HOLD` label at the top of the card
  (auto-derived from elapsed time — no content work needed)

`visual_cues` is the **main text in the exercise card** — write 12 motivational
or coaching phrases (one per 10 s of a 120 s exercise). Keep them phase-neutral
(no "breathe in" / "breathe out" — the phase label already handles that).

`steps` are **haptics only** — the text field is not shown to the user.
Always use exactly these 4 steps in this order.

```json
{
  "type": "timed_exercise",
  "duration_seconds": 120,
  "ambient_audio": "ambient/ambient_music.mp3",
  "interactive_model": "box_breathing",
  "visual_cues": [
    "Drop your shoulders. Relax.",
    "Phrase shown at 10 s.",
    "Phrase shown at 20 s.",
    "Phrase shown at 30 s.",
    "Phrase shown at 40 s.",
    "Phrase shown at 50 s.",
    "Phrase shown at 60 s.",
    "Phrase shown at 70 s.",
    "Phrase shown at 80 s.",
    "Phrase shown at 90 s.",
    "Phrase shown at 100 s.",
    "Phrase shown at 110 s."
  ],
  "steps": [
    { "text": "Inhale", "duration_seconds": 4, "haptic": "heavy" },
    { "text": "Hold",   "duration_seconds": 4, "haptic": "light" },
    { "text": "Exhale", "duration_seconds": 4, "haptic": "heavy" },
    { "text": "Hold",   "duration_seconds": 4, "haptic": "light" }
  ]
}
```

- `duration_seconds` should be a multiple of 16; nearest ceiling is used
  automatically. 120 → 128, 64 → 64, 80 → 80.
- `visual_cues` count = `duration_seconds / 10` (12 phrases for 120 s)
- Keep each phrase phase-neutral — the phase label already tells the user
  what phase they're in; the cue provides motivation / coaching

### `flash_cards`
Tap-to-flip cards. User taps card to reveal back, taps Next to advance.
Ambient music plays. All 3 MAC definitions in Day 1 use this.

```json
{
  "type": "flash_cards",
  "ambient_audio": "ambient/ambient_music.mp3",
  "cards": [
    { "front": "Term or question", "back": "Definition or answer" },
    { "front": "Second card front", "back": "Second card back" }
  ]
}
```

### `voiceover`
Coach audio with timed on-screen text cues. Used in WOD (program) lessons.
Library lessons can also use this once audio is recorded.

```json
{
  "type": "voiceover",
  "audio_files": [
    "library_mindfulness_02_short_seg_01.mp3"
  ],
  "total_audio_seconds": 45.0,
  "timed_text": [
    { "start_s": 0.0,  "text": "First text shown at 0s." },
    { "start_s": 12.0, "text": "Second text shown at 12s." },
    { "start_s": 30.0, "text": "Third text shown at 30s." }
  ]
}
```

- Audio files live in Supabase Storage bucket `lesson-audio`, signed on request
- `total_audio_seconds` = sum of all segment durations
- `timed_text` entries trigger at `start_s` relative to the start of the
  first segment (cumulative across files)

### `journal_prompt`
Full-screen journal entry. User writes freely, then saves and finishes the lesson.

```json
{
  "type": "journal_prompt",
  "prompt": "The exact question shown to the user."
}
```

- Each lesson can have at most one `journal_prompt`
- It must always be the **last block** in the lesson

### Haptic fields (optional — all `timed_exercise` blocks)

Haptics let users follow a breathing or body-awareness exercise with their eyes
closed. Two mechanisms are available — use whichever matches the exercise type.

#### `haptic` on a step (fires at step start)
Use when the step boundaries ARE the cue moments (e.g. `box_breathing` where
each step is a phase, `body_scan` where each step is a body zone).

```json
{ "text": "Inhale", "duration_seconds": 4, "haptic": "heavy" }
{ "text": "Hold",   "duration_seconds": 4, "haptic": "light" }
{ "text": "Exhale", "duration_seconds": 4, "haptic": "heavy" }
{ "text": "Hold",   "duration_seconds": 4, "haptic": "light" }
```

Intensity values: `"light"` | `"medium"` | `"heavy"`

#### `haptic_pattern` on the block (repeating cycle)
Use when the animation cycle is finer than the step duration (e.g. breathing
models where each step is a 10 s visual cue but breaths repeat every 2–12 s).
`at_offset_seconds` is measured from the start of each cycle.

```json
{
  "type": "timed_exercise",
  "duration_seconds": 60,
  "interactive_model": "coffee_breath",
  "haptic_pattern": {
    "cycle_seconds": 2,
    "cues": [
      { "at_offset_seconds": 0, "intensity": "heavy" },
      { "at_offset_seconds": 1, "intensity": "medium" }
    ]
  },
  "steps": [ ... ]
}
```

**Reference patterns for the M library:**

| Lesson | Model | Mechanism | Cycle | Cues |
|---|---|---|---|---|
| Box Breathing | `box_breathing` | step `haptic` | — | heavy Inhale, light Hold × 2, heavy Exhale |
| Coffee Breath | `coffee_breath` | `haptic_pattern` | 2 s | heavy at 0 s (inhale), medium at 1 s (exhale) |
| Milk Breath | `milk_breath` | `haptic_pattern` | 8 s | medium at 0 s (inhale), medium at 4 s (exhale) |
| Whiskey Breath | `whiskey_breath` | `haptic_pattern` | 12 s | medium at 0 s (inhale), light at 4 s (exhale) |
| Body Scan | `body_scan` | step `haptic` | — | medium on every zone step |

**Rule of thumb:** heavier haptic = action cue (start inhaling / move to next
zone). Lighter haptic = stop cue (hold, release). No haptic = passive phase.

---

## 4. Standard block order for library lessons

```
tap_through_text  →  timed_exercise  →  journal_prompt
```

The `tap_through_text` block plays ambient music that flows continuously into
the exercise (the player checks if ambient is already playing before seeking).

Other valid structures:
- `tap_through_text` → `journal_prompt` (no exercise — e.g. a reflection lesson)
- `tap_through_text` → `flash_cards` → `journal_prompt`
- `tap_through_text` → `timed_exercise` → `tap_through_text` → `timed_exercise` → `journal_prompt`

---

## 5. Migration file naming

```
supabase/migrations/YYYYMMDDHHMMSS_library_[category]_[NN]_[short|long].sql
```

Examples:
```
20260413000000_library_m01_box_breathing.sql     ← done
20260414000000_library_m02_visualization.sql
20260414000001_library_a01_discomfort_dial.sql
```

Use timestamp = today + sequential suffix (000000, 000001…) if multiple
migrations land the same day.

---

## 6. duration_seconds guideline

This is the total expected session time shown to the user. Set it to the
realistic wall-clock time including any user-paced blocks.

| Block type            | Contribution to duration_seconds     |
|-----------------------|--------------------------------------|
| `tap_through_text`    | ~10–15s per paragraph (estimate)     |
| `timed_exercise`      | exact `duration_seconds` of block    |
| `box_breathing`       | nearest 16s ceiling of block value   |
| `flash_cards`         | ~15s per card (estimate)             |
| `voiceover`           | exact `total_audio_seconds`          |
| `journal_prompt`      | ~60s (estimate)                      |

For Box Breathing (M-01 Short): 5 paragraphs × 12s = 60s + 128s exercise +
60s journal ≈ 248s → rounded to 180s displayed as `~3 min`.

**Library card display rule:** The category list card shows only the lesson
title + SHORT or LONG badge. No duration text appears on the card. The
`~X min` time is shown only on the lesson-player "Begin" screen after the
user taps into the lesson. Set `duration_seconds` accurately — it drives
that ready-screen display only.

---

## 7. SQL escape reminder

Apostrophes in SQL strings must be doubled. In the JSON payload inside SQL:
- `don't` → `don''t`
- `that's` → `that''s`
- `—` (em dash) is fine as-is

The template has a comment flagging this wherever it matters.

---

## 8. Coach ID

All lessons currently use the single V1 coach:
```
a0000000-0000-0000-0000-000000000001
```

---

## 9. Ambient audio

Default track for all library lessons: `ambient/ambient_music.mp3`

This path lives in Supabase Storage bucket `lesson-audio` and is signed at
request time. Always use this path string in content_blocks JSON — never a
full URL.

---

## 10. Reference

- Content JSON template: `content/templates/library_lesson_template.json`
- SQL migration template: `content/templates/library_lesson_migration_template.sql`
- Completed example: `content/lessons/library_m_01_short.json`
- Completed migration: `supabase/migrations/20260413000000_library_m01_box_breathing.sql`
