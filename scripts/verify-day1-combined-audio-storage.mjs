#!/usr/bin/env node
// Verify lesson-audio bucket contains Day 1 combined first-VO file (signed URL path).
//
// Usage:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/verify-day1-combined-audio-storage.mjs
//
// Without credentials: prints what to check and exits 0 (local dev / CI without secrets).
// With credentials: exits 1 if object missing (upload via scripts/upload-lesson-audio.mjs
// after placing content/audio/lesson_01/lesson_01_seg_01_02.mp3).

import { createClient } from '@supabase/supabase-js';

const BUCKET = 'lesson-audio';
const REQUIRED_PATH = 'lesson_01/lesson_01_seg_01_02.mp3';

const url =
  process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  '';

if (!url || !key) {
  console.log(
    '[verify-day1-combined-audio-storage] Skipping remote check (set SUPABASE_URL or EXPO_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY or EXPO_PUBLIC_SUPABASE_ANON_KEY).',
  );
  console.log(
    `  Required object: ${BUCKET}/${REQUIRED_PATH} (must match bytes used for Whisper in build_day1_combined_audio_migration.py).`,
  );
  console.log(
    '  Upload: place the file under content/audio/lesson_01/ then run node scripts/upload-lesson-audio.mjs',
  );
  process.exit(0);
}

const supabase = createClient(url, key);
const folder = 'lesson_01';
const fileName = 'lesson_01_seg_01_02.mp3';

const { data, error } = await supabase.storage.from(BUCKET).list(folder, { limit: 200 });

if (error) {
  console.error(`[verify-day1-combined-audio-storage] list failed: ${error.message}`);
  process.exit(1);
}

let found = (data ?? []).some((f) => f.name === fileName);
// Anon keys often cannot list bucket objects (RLS) even when the file exists;
// signed URL creation succeeds when read is allowed for this path.
if (!found) {
  const signed = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(REQUIRED_PATH, 60);
  found = Boolean(signed.data?.signedUrl && !signed.error);
}
if (!found) {
  console.error(
    `[verify-day1-combined-audio-storage] MISSING ${BUCKET}/${REQUIRED_PATH} — lesson detail signed URLs will fail for Day 1 first voiceover.`,
  );
  console.error(
    '  Add content/audio/lesson_01/lesson_01_seg_01_02.mp3 and run: node scripts/upload-lesson-audio.mjs',
  );
  process.exit(1);
}

console.log(`[verify-day1-combined-audio-storage] OK — found ${BUCKET}/${REQUIRED_PATH}`);
process.exit(0);
