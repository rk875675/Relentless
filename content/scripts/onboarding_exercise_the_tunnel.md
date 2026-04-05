# Onboarding Exercise Script — "The Tunnel"

This is the onboarding sample exercise shown to users before the paywall.
It runs on-device with on-screen text, interactive animations, and
Coach Grant voiceover narration during the scene-setting and focus phases.

---

```
LESSON TITLE: The Tunnel
LESSON TYPE: Onboarding sample exercise

========================================
EXERCISE OVERVIEW
========================================

Model: "The Tunnel"
Concept: Under pressure, your mind scatters — thoughts, noise, doubt,
everything competes for attention. The skill is learning to narrow your
focus into a tunnel. Not by fighting the noise, but by choosing one
point of focus and letting everything else exist without reacting to it.

The user rates their focus, hears Coach Grant set the scene with
narration, then watches an animated visualization of their mind
scattering and narrowing. They pick a performance cue, rate again,
and see their before/after comparison.

Total duration: ~50 seconds of guided exercise + interactive screens

========================================
AUDIO DELIVERY
========================================

Two MP3 segments needed:

1. SCENE narration (~10s)
   Filename: onboarding/tunnel_scene.mp3
   Plays during: Scene step (timed text lines appear one at a time)
   Script: Coach Grant reads the scene-setting guidance.
   On-screen text handles the words; audio is the voice over them.

2. FOCUS narration (~16s)
   Filename: onboarding/tunnel_focus.mp3
   Plays during: Focus step (scatter + tunnel phases)
   Script: Coach Grant narrates during the scatter-to-tunnel animation.
   On-screen text updates automatically; audio is the voice layer.

Upload both to Supabase storage bucket 'lesson-audio' under 'onboarding/'.
Then update SCENE_AUDIO_URL and FOCUS_AUDIO_URL in sample-exercise.tsx.

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

No audio. No bars.


SCREEN 2: RATE BEFORE
(User taps a number 1-5, taps "Next")

[On screen]
Title: "How scattered does your mind feel right now?"
Body: "1 = totally clear, 5 = all over the place"
[Five numbered buttons: 1 2 3 4 5]

No audio. No bars.


SCREEN 3: SCENE — narrated, auto-advancing
(No button. Audio bars animate. Text appears one line at a time.)

[Audio] tunnel_scene.mp3 plays
[Visual] Audio cue bars animate (5 bars, same pattern as WOD lessons)

[On-screen text — one line at a time, fading in/out every ~2.5s]
Line 1: "Think of a real moment where you need to perform."
Line 2: "A race. A rep. A tryout."
Line 3: "Put yourself there."
Line 4: "Feel the environment around you."

Auto-advances to Focus after last line + 1.5s pause.

Coach Grant voiceover script for this segment:
"Think of a real moment where you need to perform.
A race. A rep. A tryout.
Put yourself there.
Feel the environment around you."


SCREEN 4: FOCUS — narrated, auto-advancing
(No button. Three phases play over ~20 seconds.)

[Audio] tunnel_focus.mp3 plays
[Visual] Audio cue bars animate during scatter + tunnel phases,
         stop during release phase.

--- Phase 1: SCATTER (~6 seconds) ---

[Interactive model]
Five words appear at scattered positions, fading in with stagger:
  "Doubt" / "Crowd" / "Legs" / "Time" / "Rival"
Each word drifts subtly (slow random vertical movement).

[On screen — above animation]
"This is your mind under pressure."
[Audio bars animate]

Coach Grant voiceover (scatter portion):
"This is what your mind does under pressure.
Everything competes for your attention."

--- Phase 2: TUNNEL (~10 seconds) ---

[Interactive model]
Scattered words fade to near-invisible. Purple accent circle appears
at center, contracting from 2.5x to 1x scale over 2.5s. Inner circle
contracts with it. Circle pulses gently. Label appears: "Focus here."

[On screen — above animation]
"Now narrow."
[Audio bars animate]

Coach Grant voiceover (tunnel portion):
"Now narrow.
Pick one point.
Let the rest be noise.
Hold your focus here."

--- Phase 3: RELEASE (~4 seconds) ---

[On screen — circle fades, text appears centered]
"That's the skill.
Not silence. Not calm.
Just choosing where
your attention goes."

[Audio bars stop]
No voiceover during release — let the text land in silence.

Auto-advances to Cue after 4 seconds.


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

No audio. No bars.


SCREEN 6: RATE AFTER
(User taps a number 1-5, taps "Next")

[On screen]
Title: "How scattered does your mind feel now?"
Body: "1 = totally clear, 5 = all over the place"
[Five numbered buttons: 1 2 3 4 5]

No audio. No bars.


SCREEN 7: EXERCISE COMPLETE
(User reads, taps "Continue")

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

No audio. No bars.
```

---

## Notes

- The scene and focus steps are the narrated portions. Coach Grant's
  voice plays alongside on-screen text and visual animations.
- Audio bars (5-bar visualizer) animate during scene + focus (scatter
  and tunnel phases). They stop during the release phase and on all
  interactive screens (intro, ratings, cue, done).
- If no MP3 is provided (URLs are null), the exercise runs on timers
  with text + bars only — no audio plays.
- "The Tunnel" is a reusable mental model that can be referenced in
  later program lessons (e.g., "Remember the tunnel from Day 1?").
- The user's before/after ratings are not persisted — they are used
  only for the completion screen comparison within onboarding.
