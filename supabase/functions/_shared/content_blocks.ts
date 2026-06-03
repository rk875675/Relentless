import { z } from "https://esm.sh/zod@3";

const TimedTextCueSchema = z.object({
  start_s: z.number().min(0),
  text: z.string().min(1),
}).strict();

// Haptic intensity fired at the start of a step or at a pattern offset.
const HapticIntensitySchema = z.enum(["light", "medium", "heavy"]);

// A single timed haptic cue within a repeating animation cycle.
// at_offset_seconds is measured from the start of each cycle.
const HapticCueSchema = z.object({
  at_offset_seconds: z.number().min(0),
  intensity: HapticIntensitySchema,
}).strict();

// Describes a repeating haptic pattern driven by the interactive animation
// (e.g. coffee_breath, milk_breath, whiskey_breath). The pattern repeats
// every cycle_seconds for the full duration of the exercise block.
const HapticPatternSchema = z.object({
  cycle_seconds: z.number().positive(),
  cues: z.array(HapticCueSchema).min(1),
}).strict();

const ExerciseStepSchema = z.object({
  text: z.string().min(1),
  duration_seconds: z.number().int().positive(),
  // Optional haptic fired at the moment this step begins.
  haptic: HapticIntensitySchema.optional(),
}).strict();

const VoiceoverBlockSchema = z.object({
  type: z.literal("voiceover"),
  audio_files: z.array(z.string().min(1)).min(1),
  total_audio_seconds: z.number().positive(),
  timed_text: z.array(TimedTextCueSchema).default([]),
}).strict();

// Verbose phase labels for box_breathing. When set, the player shows these
// instead of the bare step `text` (e.g. "Inhale through your nose. 4 seconds.").
const BoxBreathingPhaseLabelsSchema = z.object({
  inhale: z.string().min(1),
  hold_in: z.string().min(1),
  exhale: z.string().min(1),
  hold_out: z.string().min(1),
}).strict();

// Mid-exercise overlay shown after a specific rep boundary in box_breathing
// (e.g. after rep 3, "Mind drifted? Good. Bring it back." for 5 seconds).
const BoxBreathingMidOverlaySchema = z.object({
  after_rep: z.number().int().positive(),
  text: z.string().min(1),
  duration_seconds: z.number().int().positive(),
}).strict();

// A single phase of a flexible breathing pattern (interactive_model: "breathing").
// The circle EXPANDS during "inhale", holds its size during "hold", and
// CONTRACTS during "exhale". One pattern repeats rep_count times.
const BreathingPhaseSchema = z.object({
  phase: z.enum(["inhale", "hold", "exhale"]),
  duration_seconds: z.number().int().positive(),
  haptic: HapticIntensitySchema.optional(),
  label: z.string().min(1).optional(),
}).strict();

const TimedExerciseBlockSchema = z.object({
  type: z.literal("timed_exercise"),
  duration_seconds: z.number().int().positive(),
  ambient_audio: z.string().min(1).optional(),
  interactive_model: z.string().min(1).optional(),
  // Used when the animation cycle is finer than step duration (e.g. breathing
  // models where each step is a 10 s visual cue but breaths repeat every 2–12 s).
  haptic_pattern: HapticPatternSchema.optional(),
  // Motivational phrases cycled on screen during box_breathing exercises.
  // Each phrase displays for ~10 s. Ignored for other interactive models.
  visual_cues: z.array(z.string().min(1)).optional(),
  // box_breathing only: total reps for the on-screen "Rep N of M" counter.
  // When set, must match duration_seconds / sum(steps[].duration_seconds).
  rep_count: z.number().int().positive().optional(),
  // box_breathing only: verbose phase labels rendered in place of step `text`.
  phase_labels: BoxBreathingPhaseLabelsSchema.optional(),
  // box_breathing only: overlay shown after a specific rep boundary.
  mid_overlay: BoxBreathingMidOverlaySchema.optional(),
  // Flexible breathing (interactive_model: "breathing"): an ordered list of
  // inhale/hold/exhale phases that repeats rep_count times. New coaches use this
  // instead of the legacy box_breathing steps[] path.
  pattern: z.array(BreathingPhaseSchema).min(1).optional(),
  // steps[] is the legacy box_breathing / body_scan / text-step path. Optional
  // now: a timed_exercise must provide EITHER steps[] OR pattern[]. This is
  // enforced in ContentBlocksSchema below rather than here, because a
  // z.discriminatedUnion member must be a plain ZodObject — wrapping this in
  // .superRefine() (a ZodEffects) would break the union at module load.
  steps: z.array(ExerciseStepSchema).min(1).optional(),
}).strict();

const JournalPromptBlockSchema = z.object({
  type: z.literal("journal_prompt"),
  prompt: z.string().min(1),
}).strict();

const FlashCardSchema = z.object({
  front: z.string().min(1),
  back: z.string().min(1),
}).strict();

const FlashCardsBlockSchema = z.object({
  type: z.literal("flash_cards"),
  ambient_audio: z.string().min(1).optional(),
  cards: z.array(FlashCardSchema).min(1),
}).strict();

const TapThroughTextBlockSchema = z.object({
  type: z.literal("tap_through_text"),
  ambient_audio: z.string().min(1).optional(),
  paragraphs: z.array(z.string().min(1)).min(1),
}).strict();

const PromptJournalLinkSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("program_day"),
    program_day: z.number().int().min(1).max(30),
  }).strict(),
  z.object({ kind: z.literal("session_entries") }).strict(),
]);

const PromptCardItemSchema = z.object({
  intro_hold_seconds: z.number().min(0),
  prompt: z.string().min(1),
  min_entry_seconds: z.number().min(0),
  journal_link: PromptJournalLinkSchema.optional(),
}).strict();

const PromptCardsSummarySchema = z.object({
  display: z.enum(["last", "all"]),
  header: z.string(),
  hold_seconds: z.number().min(0),
  save_to_profile: z.boolean().optional(),
}).strict();

const PromptCardsBlockSchema = z.object({
  type: z.literal("prompt_cards"),
  ambient_audio: z.string().min(1).optional(),
  cards: z.array(PromptCardItemSchema).min(1),
  summary: PromptCardsSummarySchema,
}).strict();

const BubbleSortBlockSchema = z.object({
  type: z.literal("bubble_sort"),
  ambient_audio: z.string().min(1).optional(),
  entry_instruction: z.string().min(1),
  entry_done_label: z.string().min(1),
  discard_instruction: z.string().min(1),
  can_restore: z.boolean(),
  action_prompt: z.string().min(1),
}).strict();

const TwoColumnSortBlockSchema = z.object({
  type: z.literal("two_column_sort"),
  ambient_audio: z.string().min(1).optional(),
  columns: z.array(z.object({ id: z.string().min(1), label: z.string().min(1) }).strict()).length(2),
  min_per_column: z.number().int().min(1),
  min_entry_seconds: z.number().min(0),
  intro_hold_seconds: z.number().min(0),
  close_column_id: z.string().min(1),
  action_prompt: z.string().min(1),
}).strict();

const ListBuilderBlockSchema = z.object({
  type: z.literal("list_builder"),
  ambient_audio: z.string().min(1).optional(),
  prompts: z.array(z.string().min(1)).min(1),
  min_entries: z.number().int().min(1),
  min_entry_seconds: z.number().min(0),
  summary_header: z.string().min(1),
  summary_hold_seconds: z.number().min(0),
  save_to_profile: z.boolean().optional(),
}).strict();

const CountdownTimerBlockSchema = z.object({
  type: z.literal("countdown_timer"),
  ambient_audio: z.string().min(1).optional(),
  duration_seconds: z.number().int().positive(),
  task_list: z.array(z.string().min(1)).min(1),
  completion_message: z.string().min(1),
  completion_hold_seconds: z.number().min(0),
}).strict();

const PhysiologicalSighPhaseCuesSchema = z.object({
  first_inhale: z.string().min(1),
  sneak_inhale: z.string().min(1),
  exhale: z.string().min(1),
}).strict();

// Repeating double-inhale breath circle. User controls completion with Done;
// estimated_duration_seconds is only used for progress/duration estimates.
const PhysiologicalSighBlockSchema = z.object({
  type: z.literal("physiological_sigh"),
  first_inhale_seconds: z.number().positive(),
  sneak_inhale_seconds: z.number().positive(),
  exhale_seconds: z.number().positive(),
  phase_cues: PhysiologicalSighPhaseCuesSchema,
  done_label: z.string().min(1).default("Done"),
  estimated_duration_seconds: z.number().int().positive().default(60),
}).strict();

const MultiFieldEntryFieldSchema = z.object({
  label: z.string().min(1),
  input: z.boolean().default(true),
  placeholder: z.string().min(1).optional(),
}).strict();

const MultiFieldEntryBlockSchema = z.object({
  type: z.literal("multi_field_entry"),
  ambient_audio: z.string().min(1).optional(),
  header: z.string().min(1),
  fields: z.array(MultiFieldEntryFieldSchema).min(1),
  submit_label: z.string().min(1).default("Save"),
  summary_header: z.string().min(1).optional(),
  continue_label: z.string().min(1).default("Continue"),
}).strict();

// Tap-to-toggle multi-choice list. User selects any number of options and
// taps Confirm. No time-locks, no countdown. (Day 2 Step 2.)
const MultiSelectBlockSchema = z.object({
  type: z.literal("multi_select"),
  ambient_audio: z.string().min(1).optional(),
  prompt: z.string().min(1),
  options: z.array(z.string().min(1)).min(2),
  confirm_label: z.string().min(1).default("Confirm"),
  // 0 means "Confirm always enabled". Gates only the Confirm button, never
  // adds a time-based lock.
  min_select: z.number().int().min(0).default(0),
}).strict();

// Examples shown above a multiline text input. Single Save button advances
// the lesson. No time-locks, no countdown. (Day 4.)
const ExamplesWithEntryBlockSchema = z.object({
  type: z.literal("examples_with_entry"),
  ambient_audio: z.string().min(1).optional(),
  examples_header: z.string().default(""),
  examples: z.array(z.string().min(1)).min(1),
  input_prompt: z.string().min(1),
  submit_label: z.string().min(1).default("Save"),
}).strict();

// Two-phase block: Phase 1 = single-line text entry; Phase 2 = the entered
// value displayed large with a hold prompt. Tap-to-advance both phases. (Day 7.)
const AnchorEntryBlockSchema = z.object({
  type: z.literal("anchor_entry"),
  ambient_audio: z.string().min(1).optional(),
  entry_prompt: z.string().min(1),
  save_label: z.string().min(1).default("Save"),
  hold_prompt: z.string().min(1),
  continue_label: z.string().min(1).default("Continue"),
}).strict();

const ContentBlockSchema = z.discriminatedUnion("type", [
  VoiceoverBlockSchema,
  TimedExerciseBlockSchema,
  JournalPromptBlockSchema,
  FlashCardsBlockSchema,
  TapThroughTextBlockSchema,
  PromptCardsBlockSchema,
  BubbleSortBlockSchema,
  TwoColumnSortBlockSchema,
  ListBuilderBlockSchema,
  CountdownTimerBlockSchema,
  PhysiologicalSighBlockSchema,
  MultiFieldEntryBlockSchema,
  MultiSelectBlockSchema,
  ExamplesWithEntryBlockSchema,
  AnchorEntryBlockSchema,
]);

export const ContentBlocksSchema = z.object({
  blocks: z.array(ContentBlockSchema).min(1),
}).strict().superRefine((val, ctx) => {
  // A timed_exercise must define EITHER steps[] (legacy box_breathing / body_scan
  // / text steps) OR pattern[] (flexible breathing). Enforced here because the
  // check cannot live on the discriminated-union member itself (see above).
  val.blocks.forEach((block, i) => {
    if (block.type === "timed_exercise" && !block.steps && !block.pattern) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["blocks", i],
        message: "timed_exercise requires either steps[] (box_breathing) or pattern[] (breathing).",
      });
    }
  });
});

export type ContentBlocks = z.infer<typeof ContentBlocksSchema>;
