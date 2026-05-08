# Relentless — Content Authoring Kit (V2) — Daily Workout (WOD) Guide

> **IMPORTANT — PLEASE ACTUALLY READ THIS**  
> If anything else in this file disagrees with **§0 Relentless — Quick Content Guide** below, **follow §0**.

---

## 0. Relentless — Quick Content Guide (source of truth)

### IMPORTANT! PLEASE ACTUALLY READ THIS

#### What to deliver (per lesson)

Put into **Google Drive**:

1. **Script doc (PDF)** — **verbatim** to the script template in this section (export or save the filled template as PDF).  
2. **Audio (mp3)** — **clear, high-quality** voice recordings for every voiceover segment.

#### Lesson components

A lesson is broken down into **modules** the user works through.

**Typical:** voiceover → exercise → voiceover → journal  

**You may mix and match** these in any order (still subject to integration rules in §4):

- **Voiceover**  
- **On-screen phrases** (during voiceover — your script lines; one line ≈ one on-screen phrase)  
- **Exercise**  
- **Journal prompt**

**Requirement:** **At least 1 voiceover + 1 exercise** for every Daily Workout.

#### Example script template

```
LESSON TITLE, NUMBER (Day _), MAC TAG

VOICEOVER
[filename.mp3] (approximate duration)

Full spoken script goes here


EXERCISE
[EXERCISE NAME — total duration]

Specific exercise description (types included below in Exercise Types)


VOICEOVER
[filename.mp3] (approximate duration)

Full spoken script goes here


JOURNAL PROMPT

Exact question for the user here.
```

#### Exercise types

These are **frameworks** for common exercises we have used. **Goal:** make it **interactive**. If you have a **new** exercise suggestion, describe it in detail and send it to **admin@relentlessmentaltoughness.com**.

- **Breath circle** — Animated circle with haptics for the user to follow a specific breathing pattern. **IMPORTANT:** define the pattern for the user to follow (e.g. **box breathing** — 4s in, 4s hold, 4s out, 4s hold).  
- **Flash cards** — Cards that highlight key phrases or questions so the user can fully understand. Works best when followed by a **text entry**.  
- **Text entry** — Entry for the user to respond to a question you either asked verbally or via a flash card.  
- **Journal prompt** — A special text entry that is saved to the user’s **journal** in their profile.  
- **Other interactive tools** — If your exercise type does not fall into one of these categories, include a **DETAILED** description of what it includes. How does it progress? What does the screen say? Are there haptics? Does it require user entry? Etc. **Be specific.**

---

## 1. What this is (full guide)

Relentless is a **mobile** mental performance training app for **competitive** athletes. Each day the user opens the app, completes a short **guided** session (the **WOD**), and moves through the **30-day** program. **Library** lessons exist separately; they are **not** part of this coach handoff (see product spec).

**MAC framework** — tag each lesson with at least one of **M** (Mindfulness), **A** (Acceptance), **C** (Commitment), or a combination.

**Engineering / integration:** [`content/DEVELOPER_IMPL_GUIDE.md`](DEVELOPER_IMPL_GUIDE.md).

---

## 2. What you are building

| Content | Amount | Notes |
|--------|--------|--------|
| **Daily Workouts** | **30** | Day 1–30. |
| **Deliverable** | **30 × (script PDF + mp3s)** | Upload to **Google Drive** per §0. |

**Library** content is **not** included in this pipeline.

You choose **day order topics**, **difficulty**, and **flow**; the product enforces **which** calendar day unlocks next.

---

## 3. Deliverables (per lesson) — detail

Per §0, each lesson in Drive is:

1. **Script as PDF** — matches the **template** (§0 or §4 extended copy); **verbatim** exercise / journal strings when a spec exists.  
2. **mp3** voiceover files — **clear**, **quiet**, **high-quality**; naming in **§7**.

Working in **Google Docs** first is fine; **submit** the **PDF** export for the handoff.

Line breaks in **VOICEOVER** = on-screen phrase boundaries; **~duration** next to each filename helps integration.

---

## 4. Script template (extended, matches §0)

Use **§0** as the canonical layout. This section adds **field labels** and integration notes you can paste into Docs before exporting to PDF.

```
LESSON TITLE: [short title]
LESSON NUMBER: Day [1–30]
MAC TAG(S): [M, A, C, or combination, e.g. MA, MAC]

========================================
VOICEOVER
========================================

[filename.mp3]  (~approximate duration, e.g. ~45s)

[Full spoken script. One line = one on-screen phrase while this file plays.]

[Add more [filename.mp3] + script blocks as needed.]

========================================
EXERCISE  (required — at least one per lesson)
========================================

[EXERCISE NAME — total duration in seconds]

[Specific exercise description. Name the exercise type from §0 / §5 where it applies
 (Breath circle, Flash cards, Text entry, Journal-style prompt inside exercise, or Other).]

[Steps, on-screen lines, timings — verbatim if an approved script exists.]

Step 1: "[text]" — [duration in seconds]
Step 2: "[text]" — [duration in seconds]
(add steps as needed)

========================================
VOICEOVER  (continued — if any)
========================================

[filename.mp3]  (~duration)

[Full spoken script, one line = one on-screen phrase.]

========================================
JOURNAL PROMPT  (optional unless your day design requires it)
========================================

[Exact question(s) for the user. If multiple questions, one block with a short lead-in + numbered items unless the team specifies otherwise.]
```

### On-screen text: voiceover

The **VOICEOVER** text must **match** what you **record** on each **mp3**. Integration aligns on-screen lines to the audio (internal tools such as Whisper may be used). **Clean** voice track, **no** loud music on the coach file; exercises often use **separate** ambient in the app.

For the in-app `timed_text` display, each cue must be a **complete sentence or natural clause** from the spoken audio — never a mid-sentence fragment. Target **1–2 on-screen lines** per cue; up to **3 lines** is acceptable for a complete sentence. Minimize 4-line cues. If a sentence is genuinely too long to read comfortably, **minimally paraphrase** it to 2–3 lines — keep as many verbatim words as possible and preserve the coach's voice and rhythm. Do **not** fragment a sentence mid-stream just to hit a character limit. The `start_s` for each cue is the timestamp of the first spoken word of that sentence in the audio. Do not paraphrase exercise prompts, option labels, step text, or journal prompts.

### On-screen text: exercise

**Step** lines and the **description** are what the athlete sees during the exercise module. **Separate** from the voiceover phrase list. **Verbatim** when an approved spec exists.

### Block order (when §0 says “mix and match”)

- **Minimum:** **≥1** voiceover **and** **≥1** exercise (§0).  
- **Typical:** voiceover → exercise → voiceover → journal.  
- You may **reorder** modules (e.g. exercise between two voiceovers); **if you include a journal**, put it **last** after all other voice and exercise unless the **product team** approves a different map.  
- **Multiple** exercises: **OK** — each gets its own `EXERCISE` section in script order.

---

## 5. Exercises (rules + §0 exercise types)

### Coach rules (still in effect)

1. **Verbatim** — Approved exercise copy is pasted **word for word** (see project guardrails).  
2. **Tap-to-advance** — Default for content steps (read → tap). **Do not** rely on time-locks, forced countdowns, or auto-advance for reflection / typed / multi-select style steps. **Exception:** real **breath / rhythm** patterns where timing **is** the exercise (e.g. box breathing phases). If a script asks for disallowed pacing, include the copy **verbatim** and **note** the intent; implementation follows product rules.  
3. **Structure** — Each exercise block: **name**, **total duration**, **specific description** (see §0 types), then **steps** / on-screen copy as needed.  
4. **Clarity** — Short, actionable lines; second person, present tense for visualizations when used.  
5. **Ambient** — Default exists; say if you need silence or a different treatment above the block.

### Exercise types (from Quick Content Guide)

Repeat of §0 for coaches who start here:

- **Breath circle** — Animated circle + haptics; **define** inhale/hold/exhale **timings** (e.g. box 4-4-4-4).  
- **Flash cards** — Key phrases/questions; pairs well with **text entry** after.  
- **Text entry** — Response to something said in voiceover or shown on a card.  
- **Journal prompt** (as an exercise *type* in §0) — The in-app “save to profile journal” pattern when we build that interaction. The **closing** **JOURNAL PROMPT** section of your script (§4) is where you write the **exact end-of-lesson question**; keep wording consistent with what you want saved or shown.  
- **Other** — **Detailed** spec: flow, screen copy, haptics yes/no, entry required yes/no.

**New ideas:** email **admin@relentlessmentaltoughness.com** with a full written spec.

---

## 6. Audio requirements

- **Format:** mp3.  
- **Quality:** Clear, quiet environment; **no** background **music** on the **voice** track; **~1 s** silence at start and end of each segment.  
- **Segments:** Flexible count; app stitches in order; avoid **long** empty gaps **inside** a single file.  
- **Timing:** Approximate duration next to each filename is fine; exact length comes from the files; voiceover line timing is refined in integration.

---

## 7. File naming

```
lesson_[NN]_seg_[SS].mp3
```

| Part | Meaning | Example |
|------|---------|---------|
| `NN` | Day, zero-padded | `01` … `30` |
| `SS` | Segment index | `01`, `02` |

If files are **merged** for shipping, say so explicitly in the script.

---

## 8. Delivery checklist

- [ ] **Google Drive** folder (or agreed location) with **script PDF** + **mp3s**.  
- [ ] Script **PDF** is **verbatim** with the template; **all** voiceover words; **one line per on-screen phrase** in voiceover.  
- [ ] **≥1** voiceover + **≥1** exercise (§0).  
- [ ] **mp3s** named per §7; **~duration** per file in the script.  
- [ ] **MAC** tags on the lesson header.  
- [ ] Each **EXERCISE**: name, total duration, **type** (§5), description, steps as needed; **verbatim** if spec’d.  
- [ ] **Journal** (if used): last in script unless team-approved otherwise; exact question text.  

---

## 9. Reference example — Day 1

Tone and density reference. UI may add cards or merge audio; **spoken**, **exercise**, and **journal** copy stay the contract.

```text
LESSON TITLE: What MAC Training Actually Is
LESSON NUMBER: Day 1
MAC TAG(S): M

========================================
VOICEOVER
========================================

lesson_01_seg_01.mp3  (~19s)

Welcome to Relentless.
Before we do anything — I want to explain what you actually signed up
for. Because it's not what most people think.
This is not a meditation app.
This is not positive thinking. It's not visualization boards. It's not
motivational quotes.
This is mental performance training. And there's a difference.


lesson_01_seg_02.mp3  (~89s)

The framework behind every lesson in this app is called MAC. Mindfulness.
Acceptance. Commitment. It was introduced in 2001 and it is the most
studied mental performance approach for athletes specifically. Not
soldiers. Not executives. Athletes.

Here's what each one means — in plain terms.

Mindfulness is the ability to notice what your mind is doing right now —
and redirect it. Not clearing your mind. Not thinking about nothing. Just
noticing where your attention is and choosing where it goes.

Acceptance is the willingness to feel uncomfortable — nervous, scared,
doubtful — without treating it like an emergency. You don't eliminate the
feeling. You stop letting it run your decisions.

Commitment is showing up for who you said you are, regardless of how you
feel on any given day. Not motivation. Motivation comes and goes.
Commitment is a decision.

Together, those three things are what every elite performer is doing —
whether they have a name for it or not.

Now you have the name.

Take a second and think about which one you need most.

========================================
EXERCISE
========================================

[MAC recap — 60 seconds]

Three short recall lines (flash-card style content; integration maps block type).

Step 1: "M — Mindfulness. Notice where your attention goes. Choose where
         it goes." — 20 seconds
Step 2: "A — Acceptance. Feel the discomfort. Don't react to it."
         — 20 seconds
Step 3: "C — Commitment. Show up. Regardless of how you feel."
         — 20 seconds


========================================
VOICEOVER
========================================

lesson_01_seg_03.mp3  (~19s)

Remember your answer.
On Day 30 — I'm going to ask you again.
Journal's on the next screen. One question. Be honest.


========================================
JOURNAL PROMPT
========================================

[JOURNAL PROMPT]
Which of the three — Mindfulness, Acceptance, or Commitment — is your
biggest weakness right now? Why?
```

---

## 10. FAQ

| Question | Answer |
|----------|--------|
| **Minimum** per lesson? | **≥1 voiceover + ≥1 exercise** (§0). |
| **No journal**? | **OK** — journal section is optional unless your design requires it. |
| **No exercise**? | **Not OK** for a standard handoff — every WOD needs an exercise module. |
| **Multiple exercises**? | **OK** — keep script order clear. |
| **Library**? | **Out of scope** for this coach pipeline. |
| **Multiple journal questions**? | Prefer **one** `JOURNAL PROMPT` block with lead-in + numbered items unless the team says otherwise. |

---

## 11. Quick start

1. Read **§0** (Quick Content Guide).  
2. Pick day **1–30**.  
3. Fill the **template** in Docs → **export PDF**; record **mp3s** (§7).  
4. Upload **PDF + audio** to **Google Drive**.  
5. Run **§8** checklist.  

---

## 12. Developer integration workflow (for the engineer / AI implementing new content)

This section documents the **exact process** for implementing a new batch of WOD days from coach-delivered scripts and audio files. Follow every step in order.

---

### 12a. What arrives from the coach

| Deliverable | Format | Notes |
|---|---|---|
| Script | `.md` or `.pdf` per day | Verbatim exercise copy, voiceover text, journal prompts |
| Audio | `lesson_NN_seg_SS.mp3` flat in one folder | One file per voiceover segment; some days have 1 segment (coach recorded combined), most have 2 |

Check for missing audio segments before starting. If a day is missing a `seg_02`, confirm with the coach whether the outro was recorded as part of `seg_01` — if so, merge both voiceover blocks into a single block pointing at `seg_01`.

---

### 12b. Script → JSON (lesson files)

For each day create `content/lessons/lesson_NN.json` following the same structure as existing files (e.g. `content/lessons/lesson_15.json`). Key decisions:

**Exercise type mapping (script → block type)**

| Script says | Block type in JSON |
|---|---|
| Flash Cards + Text Entry | `prompt_cards` |
| Breath Circle (one cycle as warm-up) | `timed_exercise` with `"interactive_model": "box_breathing"`, `"duration_seconds": 16` |
| Physiological Sigh | `physiological_sigh` |
| Reset builder / field form | `multi_field_entry` |
| Visualization Board | `visualization_board` *(new — UI pending)* |
| Program completion review (Day 30) | `program_completion` *(new — UI pending)* |
| Free reflection entry | `prompt_cards` (1 card) |

For `prompt_cards`, always set `"intro_hold_seconds": 0` and `"min_entry_seconds": 0` on every card. Use `"summary": {"display": "all", "header": "", "hold_seconds": 0}` for multi-card exercises; `"display": "last"` for single-card or drill-style (e.g. Day 25 mistake protocol).

Use **placeholder** `timed_text` values (one entry at `start_s: 0.0`) and the approximate `total_audio_seconds` from the script annotations — Whisper replaces these in step 12d.

Refer to `content/DEVELOPER_IMPL_GUIDE.md` §3 for the full block type reference including all fields.

---

### 12c. Upload audio to Supabase Storage

Use the Python REST API upload script (NOT `supabase storage cp`, which requires an unreliable `--experimental` flag). Template: `scripts/upload_audio_15_30.py`. Adapt for the new batch:

```python
SUPABASE_URL = "https://tnetahaviblrrjixzvbd.supabase.co"
SERVICE_ROLE_KEY = "..."  # from: npx supabase projects api-keys
BUCKET = "lesson-audio"

UPLOADS = [
    ("lesson_31_seg_01.MP3", "lesson_31/lesson_31_seg_01.mp3"),
    ("lesson_31_seg_02.MP3", "lesson_31/lesson_31_seg_02.mp3"),
    # ...
]
```

The storage path must match the `audio_files` value in the lesson JSON exactly (lowercase `.mp3`, `lesson_NN/` subfolder).

---

### 12d. Generate timed_text with Whisper

Template: `scripts/gen_sentence_cues_15_30.py`. Adapt for the new batch. Key settings that must not change:

```python
model = WhisperModel("base.en", device="cpu", compute_type="int8")
segments, _info = model.transcribe(
    local_path,
    word_timestamps=True,
    language='en',
    beam_size=5,
    vad_filter=False,    # grouping is handled by the sentence algorithm
)
```

The sentence grouping algorithm commits a cue when: (a) the last accumulated word ends in `.`, `?`, or `!`, OR (b) there is a silence gap ≥ `GAP_THRESHOLD` (1.2 s) between words. `start_s` is the start time of the first word in each group.

After running, the script prints all cues over `MAX_CHARS` (120). Add minimal paraphrases to `OVERRIDES = {}` keyed by `(day, start_s)`, then re-run. Keep verbatim words wherever possible — the goal is to paraphrase as little as the constraint requires.

---

### 12e. Enforce the 75-char display limit

After Whisper, run `scripts/check_line_lengths.py` (set `MAX_CHARS = 75`). Any cue over 75 chars needs a paraphrase. Template: `scripts/fix_cue_length_15_30.py`. Adapt the `OVERRIDES` dict for the new days.

**75 chars ≈ 3 lines at ~25 chars/line on iPhone.** This is the hard maximum — no cue should ever render as 4+ lines.

Rules:
- Keep complete sentences / natural clauses — never cut a sentence mid-stream
- Paraphrase minimally; keep as many verbatim words as possible
- A 76-77 char limit miss from a previous override means the override itself needs to be shorter
- Re-run `check_line_lengths.py` after each fix pass until the count is zero

**Day 15 edge case:** both `seg_01` and `seg_02` have a long cue at `start_s = 0.0`. Use a list value for that key and apply in segment order:
```python
(15, 0.0): ["replacement for seg_01 cue", "replacement for seg_02 cue"]
```

---

### 12f. Create the SQL migration

Migration naming: `YYYYMMDDHHMMSS_wod_days_NN_through_MM.sql`

Each lesson needs:
1. `INSERT INTO public.lessons … ON CONFLICT DO UPDATE` with full `content_blocks` JSONB
2. `DELETE FROM public.lesson_categories WHERE lesson_id IN (…)` then re-insert
3. `UPDATE public.program_schedule SET lesson_id = … WHERE program_version = 'v1' AND day_number = N`

SQL escaping: all `'` in the JSONB string must be doubled (`''`). The Python scripts handle this automatically via `sql_escape()`. Do NOT use the CLI `supabase storage cp` — it has `--experimental` issues; use the REST API script instead.

---

### 12g. Push and verify

```
npx supabase db push
```

Spot-check with `scripts/spot_check_cues.py` — confirm all cues are natural sentences at correct timestamps.

---

### 12h. Known edge cases

| Situation | Fix |
|---|---|
| Coach delivered only 1 audio segment for a 2-voiceover lesson | Merge both voiceover blocks into one block pointing at `seg_01`; scale timed_text across the full duration |
| Whisper transcribes "Day 16" as "A 16" or similar | Add to `OVERRIDES` with the corrected text |
| Whisper merges two sentences into one long cue (>120 chars) | Add to `OVERRIDES`; if multiple sentences are merged, condense to the first sentence's key point |
| Whisper `seg_02` stutter or run-on at the end | Trim trailing fragments in `OVERRIDES`; common pattern is "After you finish [name] is complete" appearing garbled |
| New exercise type not in block reference | Define the new block type schema in `DEVELOPER_IMPL_GUIDE.md` §3 and flag as "UI implementation required" |

---

*Google Docs tips: use headings for sections, 1.15–1.3 line spacing, 8–12pt space after major headings before export.*
