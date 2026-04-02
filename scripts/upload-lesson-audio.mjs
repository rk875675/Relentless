#!/usr/bin/env node
// Upload lesson audio files from content/audio/ to Supabase Storage bucket "lesson-audio".
//
// Usage:
//   SUPABASE_URL=https://... SUPABASE_SERVICE_ROLE_KEY=... node scripts/upload-lesson-audio.mjs
//
// Or set them in the environment before running.

import { createClient } from '@supabase/supabase-js';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, posix } from 'path';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const BUCKET = 'lesson-audio';
const CONTENT_DIR = join(import.meta.dirname, '..', 'content', 'audio');

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function collectFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...collectFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

const MIME = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
};

const files = collectFiles(CONTENT_DIR);

console.log(`Found ${files.length} file(s) in ${CONTENT_DIR}\n`);

let ok = 0;
let fail = 0;

for (const file of files) {
  const rel = relative(CONTENT_DIR, file);
  const storagePath = rel.split('\\').join('/'); // Windows → posix
  const ext = file.slice(file.lastIndexOf('.')).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const body = readFileSync(file);

  console.log(`  Uploading ${storagePath} (${(body.length / 1024 / 1024).toFixed(1)} MB)...`);

  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, body, {
      contentType,
      upsert: true,
    });

  if (error) {
    console.error(`    FAILED: ${error.message}`);
    fail++;
  } else {
    console.log(`    OK`);
    ok++;
  }
}

console.log(`\nDone. ${ok} uploaded, ${fail} failed.`);
if (fail > 0) process.exit(1);
