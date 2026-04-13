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

const ContentBlockSchema = z.discriminatedUnion("type", [
  VoiceoverBlockSchema,
  TimedExerciseBlockSchema,
  JournalPromptBlockSchema,
  FlashCardsBlockSchema,
  TapThroughTextBlockSchema,
]);

export const ContentBlocksSchema = z.object({
  blocks: z.array(ContentBlockSchema).min(1),
}).strict();

export type ContentBlocks = z.infer<typeof ContentBlocksSchema>;
