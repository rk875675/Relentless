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

*Google Docs tips: use headings for sections, 1.15–1.3 line spacing, 8–12pt space after major headings before export.*
