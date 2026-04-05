# Onboarding Exercise Script — "The Tunnel"

This is the onboarding sample exercise shown to users before the paywall.
It is NOT a program lesson (no audio, no Day number). It runs entirely
on-device with on-screen text and interactive animations.

---

```
LESSON TITLE: The Tunnel
LESSON TYPE: Onboarding sample exercise (no audio delivery needed)

========================================
EXERCISE OVERVIEW
========================================

Model: "The Tunnel"
Concept: Under pressure, your mind scatters — thoughts, noise, doubt,
everything competes for attention. The skill is learning to narrow your
focus into a tunnel. Not by fighting the noise, but by choosing one
point of focus and letting everything else exist without reacting to it.

This exercise walks the user through that experience interactively:
they see their mind "scatter," then practice narrowing to a single point
of focus, then choose a performance cue to carry forward.

Total duration: ~45 seconds of active exercise + user interaction screens

========================================
STEP-BY-STEP FLOW
========================================

SCREEN 1: INTRO
(User reads, taps "Start exercise")

[On screen]
Badge: "SAMPLE EXERCISE"
Title: "The Tunnel"
Body: "Under pressure your mind scatters. This exercise teaches you to
narrow your focus — not by fighting the noise, but by choosing where
your attention goes."
Card: "Pressure-to-Focus Reset" / "~45 seconds"


SCREEN 2: RATE BEFORE
(User taps a number 1-5, taps "Next")

[On screen]
Title: "How scattered does your mind feel right now?"
Body: "1 = totally clear, 5 = all over the place"
[Five numbered buttons: 1 2 3 4 5]


SCREEN 3: SET THE SCENE
(User reads, taps "I'm there")

[On screen]
Title: "Think of a real moment where you need to perform."
Body: "A race, a rep, a tryout — something coming up. Put yourself
there. Feel the environment around you."

Purpose: The user brings their own pressure moment. We do not prescribe
a scenario — this keeps it personal and avoids corny hypotheticals.


SCREEN 4: THE FOCUS SEQUENCE (auto-timed, no buttons)
(Three phases play automatically over ~20 seconds)

--- Phase 1: SCATTER (~6 seconds) ---

[Interactive model]
Five words appear at scattered positions across the screen, fading in
one by one with a slight stagger:
  - "Doubt"
  - "Crowd"
  - "Legs"
  - "Time"
  - "Rival"

Each word drifts subtly (slow random vertical movement) to create a
sense of restlessness and scattered attention.

[On screen - below the animation]
"This is your mind under pressure."

--- Phase 2: TUNNEL (~10 seconds) ---

[Interactive model]
The five scattered words fade to near-invisible (opacity ~0.08).
Simultaneously, a purple accent circle appears at the center of the
screen, starting large (2.5x scale) and smoothly contracting to 1x
over 2.5 seconds. A smaller inner circle contracts with it.

Once contracted, the circle gently pulses (scale 1.0 → 1.08 → 1.0,
looping). A small label appears in the center: "Focus here."

[On screen - above the animation]
"Now narrow."

Purpose: The visual transition from scattered words to a single focused
point makes the concept of attentional narrowing visceral and
memorable. The user watches their "scattered mind" become focused.

--- Phase 3: RELEASE (~4 seconds) ---

[On screen]
The circle fades out. Text appears centered:
"That's the skill.
Not silence. Not calm.
Just choosing where
your attention goes."

Auto-advances to the next screen after 4 seconds.


SCREEN 5: PICK A CUE
(User taps one option, taps "Next")

[On screen]
Title: "Pick one performance cue"
Body: "You just narrowed your focus under pressure. Now choose one
thought to carry forward."
[Four buttons:]
  - "Stay loose"
  - "One step at a time"
  - "Trust the work"
  - "Breathe and go"


SCREEN 6: RATE AFTER
(User taps a number 1-5, taps "Next")

[On screen]
Title: "How scattered does your mind feel now?"
Body: "1 = totally clear, 5 = all over the place"
[Five numbered buttons: 1 2 3 4 5]


SCREEN 7: EXERCISE COMPLETE
(User reads, taps "Continue" to proceed through onboarding)

[On screen — varies by before/after comparison]

Badge: "EXERCISE COMPLETE"

If rating improved (after < before):
  Title: "You just narrowed your tunnel."
  Body: "You went from a [before] to a [after]. That shift is real —
  and it's trainable."

If rating stayed the same:
  Title: "You held your focus."
  Body: "Maintaining focus under noise is the whole game. You just
  did it."

If rating did not improve:
  Title: "You practiced the skill."
  Body: "Awareness comes first. The narrowing gets sharper with
  every rep."

[Card below — always shown]
Title: "This is mental performance training"
Body: "Short, focused exercises that build the three skills elite
athletes actually use: Mindfulness, Acceptance, and Commitment."
```

---

## Notes

- This exercise has no voiceover audio — all content is on-screen text
  and interactive animations.
- "The Tunnel" is a reusable mental model that can be referenced in
  later program lessons (e.g., "Remember the tunnel from Day 1?").
- The scattered words and contraction animation are built with React
  Native's Animated API (no external dependencies).
- The user's before/after ratings are not persisted — they are used
  only for the completion screen comparison within the onboarding flow.
