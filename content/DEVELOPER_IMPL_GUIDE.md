# Developer Implementation Guide — Library Lessons

How to ship a new library lesson in ~10 minutes.

---

## 1. Quick-start checklist

1. Pick the next available UUID + sort_order from the registry below
2. Copy `content/templates/library_lesson_template.json` → fill in content
3. Copy `content/templates/library_lesson_migration_template.sql` → fill in placeholders
4. `supabase db push`
5. Done — lesson appears in the Library tab immediately

**Verbatim exercise copy:** When implementing from `CONTENT_DELIVERY_GUIDE.md` or
any approved lesson script, transcribe **exercise** fields into `content_blocks`
**word for word** — including `interactive_model`, `steps[].text`, multi-select
option strings, and related coach-authored labels. Do not paraphrase, tighten, or
merge exercise copy in JSON or SQL migrations. If the spec does not match a block
type, resolve with a content or product revision rather than rewriting the script.

**Library lesson types (`library` / `library_long`) — in-player exit:** The lesson
player always shows a top-left close (X) while content is running. Tapping it (or
Android hardware back, while the lesson is active) stops audio/timers, navigates
back, and does **not** call the server completion flow — so no progress/MAC
deltas, no journal post from that session, and program “Past WODs” in the
Library category list is unchanged. Program/scheduled WODs (`standard`) keep
their current behavior: no in-player top bar while the workout is in progress
(edge swipe stays off during play).

---

## 2. UUID + sort_order registry

UUIDs are deterministic so they can be hardcoded in seeds and cross-referenced
anywhere. Use the next available row in each category.

### Program Lessons / Daily Workouts (d0…)

| Day | Title                                      | UUID                                   | sort_order | Status   |
|-----|--------------------------------------------|-----------------------------------------|------------|----------|
| 1   | What MAC Training Actually Is              | `d0000000-0000-0000-0000-000000000001` | 0          | ✅ DONE  |
| 2   | The Science of Choking (And How to Stop It)| `d0000000-0000-0000-0000-000000000002` | 1          | ✅ DONE  |
| 3   | Your Baseline — Mental Gut Check           | `d0000000-0000-0000-0000-000000000003` | 2          | ✅ DONE  |
| 4   | Identity Statement                         | `d0000000-0000-0000-0000-000000000004` | 3          | ✅ DONE  |
| 5   | Box Breathing — Level 1                    | `d0000000-0000-0000-0000-000000000005` | 4          | ✅ DONE  |
| 6   | Body Scan — Level 1                        | `d0000000-0000-0000-0000-000000000006` | 5          | ✅ DONE  |
| 7   | Focus Anchor — Find Yours                  | `d0000000-0000-0000-0000-000000000007` | 6          | ✅ DONE  |
| 8   | Why You're Better in Practice Than Games  | `d0000000-0000-0000-0000-000000000008` | 7          | ✅ DONE  |
| 9   | The 30-Second Reset                       | `d0000000-0000-0000-0000-000000000009` | 8          | ✅ DONE  |
| 10  | Controlling the Controllables             | `d0000000-0000-0000-0000-000000000010` | 9          | ✅ DONE  |
| 11  | The Physiological Sigh                    | `d0000000-0000-0000-0000-000000000011` | 10         | ✅ DONE  |
| 12  | The Evidence Log                          | `d0000000-0000-0000-0000-000000000012` | 11         | ✅ DONE  |
| 13  | Building Your Daily Routine               | `d0000000-0000-0000-0000-000000000013` | 12         | ✅ DONE  |
| 14  | Using Your Anchor In Competition          | `d0000000-0000-0000-0000-000000000014` | 13         | ✅ DONE  |

**Sort order pattern:** 0-indexed by day number (Day 1 = 0, Day 2 = 1, …)

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

| Lesson         | UUID                                   | sort_order | Status   |
|----------------|----------------------------------------|------------|----------|
| A-01 Short     | `e2000000-0000-0000-0000-000000000001` | 200        | ✅ DONE  |
| A-01 Long      | `e2000000-0000-0000-0000-000000000002` | 201        | —        |
| A-02 Short     | `e2000000-0000-0000-0000-000000000003` | 210        | ✅ DONE  |
| A-02 Long      | `e2000000-0000-0000-0000-000000000004` | 211        | —        |
| A-03 Short     | `e2000000-0000-0000-0000-000000000005` | 220        | ✅ DONE  |
| A-03 Long      | `e2000000-0000-0000-0000-000000000006` | 221        | —        |
| A-04 Short     | `e2000000-0000-0000-0000-000000000007` | 230        | ✅ DONE  |
| A-04 Long      | `e2000000-0000-0000-0000-000000000008` | 231        | —        |
| A-05 Short     | `e2000000-0000-0000-0000-000000000009` | 240        | ✅ DONE  |
| A-05 Long      | `e2000000-0000-0000-0000-000000000010` | 241        | —        |
| A-06 Short     | `e2000000-0000-0000-0000-000000000011` | 250        | ✅ DONE  |
| A-06 Long      | `e2000000-0000-0000-0000-000000000012` | 251        | —        |

### Commitment (e3…)

| Lesson         | UUID                                   | sort_order | Status   |
|----------------|----------------------------------------|------------|----------|
| C-01 Short     | `e3000000-0000-0000-0000-000000000001` | 300        | ✅ DONE  |
| C-01 Long      | `e3000000-0000-0000-0000-000000000002` | 301        | —        |
| C-02 Short     | `e3000000-0000-0000-0000-000000000003` | 310        | ✅ DONE  |
| C-02 Long      | `e3000000-0000-0000-0000-000000000004` | 311        | —        |
| C-03 Short     | `e3000000-0000-0000-0000-000000000005` | 320        | ✅ DONE  |
| C-03 Long      | `e3000000-0000-0000-0000-000000000006` | 321        | —        |

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

### Verbatim exercise copy (program Daily Workouts + library)

Approved scripts define the athlete-facing **exercise** copy. When you add or
update `timed_exercise` and other exercise blocks (including specialized
interactive types), paste prompts, option labels, and `interactive_model` text
**exactly** as authored. Do not paraphrase for length or “clarity” in the database
or templates. Same rule applies to program lesson migrations as to library
lessons — see also Section 1 checklist above and `CONTENT_DELIVERY_GUIDE.md`
(Section 4a / 5).

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

#### Optional fields (Day 5+ box breathing)

These three fields extend the box-breathing renderer for richer Daily Workout
sessions. They are **optional**; older blocks (Day 6 / Day 7 intros) leave
them unset and behave exactly as before.

- `rep_count` (number) — total reps. When set, a "Rep N of M" badge is
  rendered top-right of the screen for the duration of the block. Should
  match `duration_seconds / 16`.
- `phase_labels` (object) — verbose, coach-authored labels rendered in place
  of the bare `INHALE / HOLD / EXHALE / HOLD` chrome. All four keys required
  when set:
  ```json
  "phase_labels": {
    "inhale":   "Inhale through your nose. 4 seconds.",
    "hold_in":  "Hold. 4 seconds.",
    "exhale":   "Exhale through your mouth. 4 seconds.",
    "hold_out": "Hold. 4 seconds."
  }
  ```
- `mid_overlay` (object) — overlay shown after a specific rep boundary
  (e.g. a "mind drifted? bring it back" reset between reps). Replaces the
  phase-label/visual-cue card text for `duration_seconds`; does **not**
  pause the breath animation.
  ```json
  "mid_overlay": {
    "after_rep": 3,
    "text": "Mind drifted? Good. Bring it back.",
    "duration_seconds": 5
  }
  ```

### `multi_select`
Tap-to-toggle multi-choice list with a Confirm button. **Tap-to-advance only**
— Confirm is gated only by `min_select` (0 = always enabled), never by a time
lock. Used in WOD Day 2 to capture the athlete's distraction profile.

```json
{
  "type": "multi_select",
  "ambient_audio": "ambient/ambient_music.mp3",
  "prompt": "What was your brain doing? Tap all that apply.",
  "options": [
    "Thinking about the outcome",
    "Watching my competition",
    "Tracking time, score, or distance"
  ],
  "confirm_label": "Confirm",
  "min_select": 0
}
```

- `prompt` — verbatim prompt shown above the list
- `options` — tap-to-toggle option labels; transcribe verbatim
- `confirm_label` — button label shown when the min-select threshold is met
- `min_select` — minimum selections required before Confirm enables; use `0`
  to always allow Confirm (default)
- Selections are saved to the journal entry as a bullet list under the
  prompt (e.g. `What was your brain doing?\n\n• Thinking about the outcome`)

### `examples_with_entry`
Fixed list of authored examples shown above a multiline text input with a
single Save button. **Tap-to-advance only**, no min-time gate. Used in WOD
Day 4 (identity-statement examples → athlete writes their own).

```json
{
  "type": "examples_with_entry",
  "ambient_audio": "ambient/ambient_music.mp3",
  "examples_header": "",
  "examples": [
    "I am an athlete who shows up the same — whether I'm winning or losing.",
    "I am an athlete who competes through discomfort."
  ],
  "input_prompt": "Now write 2–3 of your own. Present tense. Be specific.",
  "submit_label": "Save"
}
```

- `examples_header` — optional heading above the example list (empty string = no header)
- `examples` — verbatim coach-authored examples
- `input_prompt` — verbatim prompt shown above the text input
- `submit_label` — Save button label
- Whatever the athlete types is appended to the journal entry under the
  `input_prompt` (skipped if empty)

### `anchor_entry`
Two-phase block: Phase 1 = single-line text entry; Phase 2 = the entered
value displayed large with a hold-prompt and Continue button. Both phases
are tap-to-advance. Used in WOD Day 7 (focus-anchor selection + hold).

```json
{
  "type": "anchor_entry",
  "ambient_audio": "ambient/ambient_music.mp3",
  "entry_prompt": "What is your focus anchor? One or two words. Choose something that brings you into the present moment.",
  "save_label": "Save",
  "hold_prompt": "Hold your anchor. When your mind drifts — and it will — bring it back. That's the rep.",
  "continue_label": "Continue"
}
```

- `entry_prompt` — verbatim prompt shown above the text input in Phase 1
- `save_label` — Save button label (enabled when input is non-empty)
- `hold_prompt` — verbatim prompt shown beneath the large-format anchor word in Phase 2
- `continue_label` — button label that ends the block
- Saved to the journal entry as `Anchor: <typed value>`

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

### `prompt_cards`
Sequential full-screen cards: the front shows an intro hold, the back reveals a text-entry prompt. Used in A-03 through A-06 and C-01.

```json
{
  "type": "prompt_cards",
  "ambient_audio": "ambient/ambient_music.mp3",
  "cards": [
    {
      "intro_hold_seconds": 3,
      "prompt": "The question shown to the user.",
      "min_entry_seconds": 20
    }
  ],
  "summary": {
    "display": "last",
    "header": "",
    "hold_seconds": 10
  }
}
```

- `intro_hold_seconds` — minimum time on the intro face before user can flip to the entry side (typically 3 s)
- `min_entry_seconds` — minimum time on the entry side before user can advance (20 s or 30 s per spec)
- `summary.display` — `"last"` shows only the final card's answer; `"all"` shows all answers together
- `summary.header` — text shown above the answer(s); empty string = no header, answer displayed large
- `summary.hold_seconds` — how long the summary screen is held before the journal prompt appears
- `summary.save_to_profile` — optional boolean; if true, answers are persisted to the user's profile

### `bubble_sort`
Interactive exercise: user dumps worries as text entries that become floating bubbles, then taps to pop uncontrollable ones, then gives a next-step action on each remaining bubble. Used in A-01.

```json
{
  "type": "bubble_sort",
  "ambient_audio": "ambient/ambient_music.mp3",
  "entry_instruction": "Write down everything on your mind. One worry at a time.",
  "entry_done_label": "I'm done",
  "discard_instruction": "Tap any bubble that is outside your control right now.",
  "can_restore": true,
  "action_prompt": "What is the one next step you can take on this?"
}
```

- `entry_instruction` — hint text shown during the entry phase
- `entry_done_label` — label for the button that ends the entry phase
- `discard_instruction` — instruction shown during the tap-to-pop phase
- `can_restore` — if true, a back arrow lets the user restore an accidentally popped bubble
- `action_prompt` — prompt shown per remaining bubble in the flash-card action phase

### `two_column_sort`
Split-screen UI: user fills two labelled columns via text entry. The losing column animates closed; each item in the winning column gets a follow-up action prompt. Used in A-02.

```json
{
  "type": "two_column_sort",
  "ambient_audio": "ambient/ambient_music.mp3",
  "columns": [
    { "id": "control", "label": "What I Control" },
    { "id": "no_control", "label": "What I Don't" }
  ],
  "min_per_column": 1,
  "min_entry_seconds": 20,
  "intro_hold_seconds": 3,
  "close_column_id": "no_control",
  "action_prompt": "What is your next action on this?"
}
```

- `columns` — exactly two objects with `id` and `label`; order = left, right
- `min_per_column` — minimum entries required in each column before advancing
- `min_entry_seconds` — total minimum time spent in the entry phase
- `intro_hold_seconds` — minimum hold on each action-prompt intro card
- `close_column_id` — which column's `id` to animate closed
- `action_prompt` — prompt shown per item in the remaining (open) column

### `list_builder`
Open text-entry exercise where each submission stacks on screen. Used in C-02.

```json
{
  "type": "list_builder",
  "ambient_audio": "ambient/ambient_music.mp3",
  "prompts": [
    "Why do you love your sport?",
    "What do you love about it?"
  ],
  "min_entries": 5,
  "min_entry_seconds": 10,
  "summary_header": "This is your foundation.",
  "summary_hold_seconds": 15,
  "save_to_profile": true
}
```

- `prompts` — suggested question starters shown to the user (scrollable/tappable)
- `min_entries` — minimum entries before the user can finish
- `min_entry_seconds` — minimum time per entry before the user can submit it
- `summary_header` — header text on the final all-entries screen
- `summary_hold_seconds` — hold time before journal prompt appears
- `save_to_profile` — if true, the list is persisted to the user's profile

### `countdown_timer`
Task-selection screen followed by a full-screen countdown ring. Used in C-03.

```json
{
  "type": "countdown_timer",
  "ambient_audio": "ambient/ambient_music.mp3",
  "duration_seconds": 60,
  "task_list": [
    "60 seconds of stretching",
    "A set of pushups"
  ],
  "completion_message": "You started. That's the hardest part.",
  "completion_hold_seconds": 3
}
```

- `task_list` — scrollable list of suggested tasks; user taps one to select before starting
- `completion_message` — text shown on the completion screen after the timer finishes
- `completion_hold_seconds` — hold time on the completion screen before journal prompt appears

### `journal_prompt`
Full-screen journal entry. User writes freely, then saves and finishes the lesson.

```json
{
  "type": "journal_prompt",
  "prompt": "The exact question shown to the user."
}
```

- The lesson can have at most one `journal_prompt` **block** in
  `content_blocks` (saving the journal **ends the session**). If the script
  has more than one reflection question, use a **single** `prompt` with
  multiple questions in one string, matching the coach handoff. It must
  always be the **last block** in the lesson

### Journal body formatting contract

`FormattedJournalBody` renders saved journal text in the journal list and the
in-lesson context card. It auto-detects these patterns per `\n\n`-separated
block:

| Pattern | Detection | Example |
|---------|-----------|---------|
| **Q&A pair** | First line contains `?`, ≥ 2 lines | `prompt_cards` |
| **Labeled pair** | Every line matches `Label: value` | `bubble_sort`, `two_column_sort` |
| **Bullet list** | Every line starts with `•` | `list_builder` |
| **Plain text** | Anything else | Free-form reflection |

Sections separated by `\n\n---\n\n` render with a visual divider.

When adding a new interactive block type, ensure its `onComplete(collectedText)`
output follows one of these patterns so the journal renders cleanly.

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

**New repeating inhale/exhale circle (`interactive_model`):** Register the model
in `CIRCLE_BREATH_MODEL_CONFIG` in `mobile/app/lesson/[id].tsx` with `timing`
(ms: inhale, hold-in, exhale, hold-out) and `wallDrive: true` so the bubble and
Inhale/Exhale labels stay locked to wall time. Set `haptic_pattern.cycle_seconds`
to the total cycle length in seconds (must match the sum of those ms phases).

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
- `tap_through_text` → `prompt_cards` → `journal_prompt` (A-03 through A-06, C-01)
- `tap_through_text` → `bubble_sort` (A-01 — no journal; exercise phase handles actions)
- `tap_through_text` → `two_column_sort` (A-02 — no journal; exercise phase handles actions)
- `tap_through_text` → `list_builder` (C-02 — no journal; summary is the closing)
- `tap_through_text` → `countdown_timer` → `journal_prompt` (C-03)

---

## 5. Migration file naming

```
supabase/migrations/YYYYMMDDHHMMSS_library_[category]_[NN]_[short|long].sql
```

Examples:
```
20260413000000_library_m01_box_breathing.sql      ← done
20260413000010_library_a01_worry_drop.sql         ← done
20260413000011_library_a02_control_check.sql      ← done
20260413000012_library_a03_name_it_face_it.sql    ← done
20260413000013_library_a04_the_honest_line.sql    ← done
20260413000014_library_a05_coaches_perspective.sql ← done
20260413000015_library_a06_emotional_replay.sql   ← done
20260413000016_library_c01_future_self.sql        ← done
20260413000017_library_c02_your_foundation.sql    ← done
20260413000018_library_c03_one_minute_ignition.sql ← done
20260414000000_wod_days_2_through_7.sql            ← done (Days 2-7 content)
20260414000001_dev_set_program_day.sql             ← done (dev day switcher RPCs)
```

Use timestamp = today + sequential suffix (000000, 000001…) if multiple
migrations land the same day.

---

## 6. duration_seconds guideline

This is the total expected session time shown to the user. Set it to the
realistic wall-clock time including any user-paced blocks.

| Block type             | Contribution to duration_seconds              |
|------------------------|-----------------------------------------------|
| `tap_through_text`     | ~10–15s per paragraph (estimate)              |
| `timed_exercise`       | exact `duration_seconds` of block             |
|   ↳ user-paced (no `interactive_model`) | ~5s per step (tap-paced)     |
| `box_breathing`        | nearest 16s ceiling of block value            |
| `flash_cards`          | ~15s per card (estimate)                      |
| `voiceover`            | exact `total_audio_seconds`                   |
| `prompt_cards`         | ~25s per card (tap-paced estimate)            |
| `multi_select`         | ~25s (tap-paced estimate)                     |
| `examples_with_entry`  | ~45s (tap-paced estimate)                     |
| `anchor_entry`         | ~45s (entry + hold, tap-paced estimate)       |
| `list_builder`         | ~10s × `min_entries` (tap-paced estimate)     |
| `bubble_sort`          | ~30s (tap-paced estimate)                     |
| `two_column_sort`      | ~30s (tap-paced estimate)                     |
| `countdown_timer`      | exact `duration_seconds` of block             |
| `journal_prompt`       | ~60s (estimate)                               |

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
- Completed example (M): `content/lessons/library_m_01_short.json`
- Completed example (A — prompt_cards): `content/lessons/library_a_03_short.json`
- Completed example (A — bubble_sort): `content/lessons/library_a_01_short.json`
- Completed example (C — list_builder): `content/lessons/library_c_02_short.json`
- Completed migration: `supabase/migrations/20260413000000_library_m01_box_breathing.sql`

### New block types requiring UI implementation

The following block types are defined in content but need renderer implementation in the mobile app:

| Block type        | Used in      | Notes |
|-------------------|--------------|-------|
| `prompt_cards`    | A-03 – A-06, C-01 | Sequential flip cards with timed text entry and summary screen |
| `bubble_sort`     | A-01         | Animated bubble entry → tap-to-pop → flash-card action phase |
| `two_column_sort` | A-02         | Split-screen sort → close uncontrollable column → action prompts |
| `list_builder`    | C-02         | Stacking list entry with profile save |
| `countdown_timer` | C-03         | Task selector + 60 s countdown ring + completion hold |
