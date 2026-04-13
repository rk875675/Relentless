import { z } from "https://esm.sh/zod@3";

const TimedTextCueSchema = z.object({
  start_s: z.number().min(0),
  text: z.string().min(1),
}).strict();

const ExerciseStepSchema = z.object({
  text: z.string().min(1),
  duration_seconds: z.number().int().positive(),
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

const ContentBlockSchema = z.discriminatedUnion("type", [
  VoiceoverBlockSchema,
  TimedExerciseBlockSchema,
  JournalPromptBlockSchema,
  FlashCardsBlockSchema,
]);

export const ContentBlocksSchema = z.object({
  blocks: z.array(ContentBlockSchema).min(1),
}).strict();

export type ContentBlocks = z.infer<typeof ContentBlocksSchema>;
