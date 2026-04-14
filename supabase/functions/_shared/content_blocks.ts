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
  steps: z.array(ExerciseStepSchema).min(1),
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

const PromptCardItemSchema = z.object({
  intro_hold_seconds: z.number().min(0),
  prompt: z.string().min(1),
  min_entry_seconds: z.number().min(0),
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
]);

export const ContentBlocksSchema = z.object({
  blocks: z.array(ContentBlockSchema).min(1),
}).strict();

export type ContentBlocks = z.infer<typeof ContentBlocksSchema>;
