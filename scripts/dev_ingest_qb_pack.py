"""
Dev-only ingestion for the coach web-app lesson pack (Phase 1 smoke test).

Reads an unzipped pack (manifest.json + bundled audio) and maps it into the
app's content_blocks model the same way lessons are created manually:
  - voiceover  -> audio_files (bucket-relative storage paths) + total_audio_seconds
                  (read from the mp3) + timed_text (Whisper word-level cues,
                  sentence-grouped, hard-split to <= MAX_CHARS, verbatim words)
  - flash_cards -> transcribed verbatim (front/back) + ambient_audio
  - journal_prompt -> prompt verbatim (last block)

Outputs (does NOT touch the DB or storage):
  - scripts/_dev_pack/qb_dev_content_blocks.json   (review artifact)
  - supabase/migrations/20260530000000_dev_test_qb_program_lesson.sql

The migration inserts a single ISOLATED dev lesson: published=true but with NO
program_schedule and NO lesson_categories rows and lesson_type='dev-test', so it
never appears in the home WOD or any library tab. Reachable only via direct
/lesson/<uuid> navigation from the __DEV__-only home button.

Run audio upload (scripts/upload_qb_dev_pack.py) and `npx supabase db push`
separately.
"""

import json
import os

from faster_whisper import WhisperModel
from mutagen.mp3 import MP3

HERE = os.path.dirname(__file__)
PACK_DIR = os.path.join(HERE, "_dev_pack")
MANIFEST = os.path.join(PACK_DIR, "manifest.json")
OUT_JSON = os.path.join(PACK_DIR, "qb_dev_content_blocks.json")
MIGS_DIR = os.path.join(HERE, "..", "supabase", "migrations")
# Forward-only "preview gate" migration: adds production_ready, fixes the cues,
# and tags the lesson mindfulness. The initial insert migration
# (20260530000000_dev_test_qb_program_lesson.sql) is left untouched.
OUT_GATE_MIG = os.path.join(MIGS_DIR, "20260530010000_dev_lesson_preview_gate.sql")

DEV_LESSON_UUID = "dddddddd-dddd-dddd-dddd-dddddddddddd"
V1_COACH_UUID = "a0000000-0000-0000-0000-000000000001"
LESSON_TYPE = "dev-test"
MAC_CATEGORY = "mindfulness"

GAP_THRESHOLD = 1.2   # seconds of silence -> force a new cue
MAX_CHARS = 75        # hard display limit (~3 lines on iPhone), per guide 12e

# Reviewed, sentence-level cues for this exact audio. The pack audio is byte-for-byte
# Day 15 (identical 87.28s / 20.14s durations + script), so we reuse the human-reviewed
# Day-15 timed_text from content/lessons/lesson_15.json instead of auto-fragmenting at
# 75 chars. This honors CONTENT_DELIVERY_GUIDE 4 / 12d-e: every cue is a complete
# sentence or natural clause (never a mid-sentence fragment), minimally paraphrased to
# fit the 75-char display limit, with start_s at the first spoken word of the sentence.
CURATED_CUES = {
    "grant-chiasson/qb-program/lesson_01/seg_01.mp3": [
        {"start_s": 0.0,  "text": "Day 15. Your focus anchor — the word your mind returns to when it drifts."},
        {"start_s": 9.34, "text": "The most powerful anchor isn't just a word in your head — it's physical."},
        {"start_s": 22.7, "text": "Elite athletes do this instinctively. They're trained focus triggers."},
        {"start_s": 47.86, "text": "The key is consistency — the same thing, the same way, every single time."},
        {"start_s": 57.26, "text": "Do it enough times in a focused state and it begins to trigger the state."},
        {"start_s": 66.68, "text": "That's what we're building today."},
        {"start_s": 69.08, "text": "Think about the physical environment where you compete."},
        {"start_s": 72.46, "text": "What is something you can see, touch, feel or do?"},
        {"start_s": 77.12, "text": "Something always available in that space — that's your competition anchor."},
        {"start_s": 83.52, "text": "On your screen, you're going to identify it and lock it in."},
    ],
    "grant-chiasson/qb-program/lesson_01/seg_02.mp3": [
        {"start_s": 0.0,  "text": "Every rep with that anchor strengthens the link to your focused state."},
        {"start_s": 6.62, "text": "Do it in practice, do it in warmups, do it in competition."},
        {"start_s": 11.12, "text": "The more consistent you are, the faster it works when the pressure is real."},
        {"start_s": 16.26, "text": "Check out the journal and have to finish."},
        {"start_s": 17.96, "text": "Day 15 is complete."},
    ],
}


def ends_sentence(word_text):
    t = word_text.rstrip()
    return t.endswith(".") or t.endswith("?") or t.endswith("!")


def capitalize(text):
    return (text[0].upper() + text[1:]) if text else text


def split_words_to_chunks(words):
    """Split a list of word dicts into <= MAX_CHARS chunks at word boundaries.
    Keeps every word verbatim; only inserts display breaks. start_s = first
    word start of each chunk."""
    chunks = []
    buf = []
    for w in words:
        candidate = (" ".join(x["word"].strip() for x in buf + [w])).strip()
        if buf and len(candidate) > MAX_CHARS:
            chunks.append(buf)
            buf = [w]
        else:
            buf.append(w)
    if buf:
        chunks.append(buf)
    cues = []
    for ch in chunks:
        text = capitalize(" ".join(x["word"].strip() for x in ch).strip())
        cues.append({"start_s": round(ch[0]["start"], 2), "text": text})
    return cues


def words_to_cues(words):
    """Group words into sentence/clause cues (sentence-end or silence gap),
    then hard-split any group exceeding MAX_CHARS."""
    groups = []
    buf = []
    for i, w in enumerate(words):
        buf.append(w)
        commit = False
        if ends_sentence(w["word"]):
            commit = True
        elif i + 1 < len(words) and (words[i + 1]["start"] - w["end"]) >= GAP_THRESHOLD:
            commit = True
        if commit:
            groups.append(buf)
            buf = []
    if buf:
        groups.append(buf)

    cues = []
    for g in groups:
        text = " ".join(x["word"].strip() for x in g).strip()
        if len(text) <= MAX_CHARS:
            cues.append({"start_s": round(g[0]["start"], 2), "text": capitalize(text)})
        else:
            cues.extend(split_words_to_chunks(g))
    return cues


def transcribe_to_cues(model, local_path):
    segments, _info = model.transcribe(
        local_path,
        word_timestamps=True,
        language="en",
        beam_size=5,
        vad_filter=False,
    )
    all_words = []
    for seg in segments:
        if seg.words:
            for w in seg.words:
                all_words.append({"start": w.start, "end": w.end, "word": w.word})
    return words_to_cues(all_words)


def estimate_duration(blocks):
    total = 0.0
    for b in blocks:
        t = b["type"]
        if t == "voiceover":
            total += b["total_audio_seconds"]
        elif t == "flash_cards":
            total += len(b.get("cards", [])) * 15
        elif t == "journal_prompt":
            total += 60
        else:
            total += 30
    return int(round(total))


def sql_escape(s):
    return s.replace("'", "''")


def main():
    with open(MANIFEST, encoding="utf-8") as f:
        manifest = json.load(f)

    program = manifest["program"]
    lesson = program["lessons"][0]
    title = lesson["title"]

    model = None  # lazy-load Whisper only if a voiceover has no curated cues

    out_blocks = []
    long_cues = []

    for block in lesson["blocks"]:
        btype = block["type"]

        if btype == "voiceover":
            audio_path = block["audio_files"][0]  # bucket-relative storage path
            local = os.path.join(PACK_DIR, *audio_path.split("/"))
            if not os.path.exists(local):
                raise FileNotFoundError(f"Missing bundled audio: {local}")
            dur = round(MP3(local).info.length, 2)
            if audio_path in CURATED_CUES:
                cues = CURATED_CUES[audio_path]
                print(f"[voiceover] {audio_path}  ({dur}s)  -> {len(cues)} reviewed cue(s)", flush=True)
            else:
                if model is None:
                    print("Loading faster-whisper base.en model...", flush=True)
                    model = WhisperModel("base.en", device="cpu", compute_type="int8")
                print(f"[voiceover] {audio_path}  ({dur}s)  (whisper)", flush=True)
                cues = transcribe_to_cues(model, local)
                print(f"           -> {len(cues)} cue(s)", flush=True)
            for c in cues:
                if len(c["text"]) > MAX_CHARS:
                    long_cues.append((audio_path, c["start_s"], len(c["text"]), c["text"]))
            out_blocks.append({
                "type": "voiceover",
                "audio_files": [audio_path],
                "total_audio_seconds": dur,
                "timed_text": cues,
            })

        elif btype == "flash_cards":
            cards = [
                {"front": c["front"], "back": c["back"]}
                for c in block["cards"]
            ]
            fc = {"type": "flash_cards", "cards": cards}
            ambient = block.get("ambient_audio")
            if ambient:
                fc["ambient_audio"] = ambient
            print(f"[flash_cards] {len(cards)} card(s) (verbatim)", flush=True)
            out_blocks.append(fc)

        elif btype == "journal_prompt":
            prompt = block["prompt"].rstrip()
            print("[journal_prompt] (verbatim)", flush=True)
            out_blocks.append({"type": "journal_prompt", "prompt": prompt})

        else:
            raise ValueError(f"Unsupported block type for Phase 1 smoke test: {btype}")

    duration_seconds = estimate_duration(out_blocks)
    content_blocks = {"blocks": out_blocks}

    with open(OUT_JSON, "w", encoding="utf-8") as f:
        json.dump(
            {"title": title, "duration_seconds": duration_seconds, "content_blocks": content_blocks},
            f, ensure_ascii=False, indent=2,
        )
    print(f"\nReview JSON written: {OUT_JSON}")

    cb_json = json.dumps(content_blocks, ensure_ascii=False, separators=(",", ":"))
    cb_sql = sql_escape(cb_json)

    sql = f"""-- Preview gate + cue fix for the dev QB-pack lesson.
-- Generated by scripts/dev_ingest_qb_pack.py. Forward-only migration applied on
-- top of 20260530000000_dev_test_qb_program_lesson.sql.
--
-- 1) Adds lessons.production_ready (default TRUE so every existing lesson is
--    unchanged and stays visible to all users).
-- 2) Updates the dev lesson's content_blocks to the reviewed, sentence-level
--    cues and marks it production_ready = false.
-- 3) Tags it '{MAC_CATEGORY}' so it renders with the correct MAC color + trophy
--    tag and appears in that library tab exactly as it would in production.
--
-- The lessons Edge Function shows production_ready = false lessons ONLY to
-- is_dev accounts, in both the catalog list and the player. Real production
-- users see no change until production_ready is flipped to true.

begin;

alter table public.lessons
  add column if not exists production_ready boolean not null default true;

comment on column public.lessons.production_ready is
  'When false, the lesson is a not-yet-live preview: the lessons Edge Function serves it only to is_dev accounts (list + detail). Flip to true to release it to all users. Defaults true so existing content is unaffected.';

update public.lessons set
  content_blocks = '{cb_sql}'::jsonb,
  duration_seconds = {duration_seconds},
  production_ready = false,
  updated_at = now()
where id = '{DEV_LESSON_UUID}';

insert into public.lesson_categories (lesson_id, category)
values ('{DEV_LESSON_UUID}', '{MAC_CATEGORY}')
on conflict (lesson_id, category) do nothing;

commit;
"""
    with open(OUT_GATE_MIG, "w", encoding="utf-8") as f:
        f.write(sql)
    print(f"Gate migration written: {OUT_GATE_MIG}")
    print(f"duration_seconds = {duration_seconds}")

    if long_cues:
        print(f"\nWARNING: {len(long_cues)} cue(s) still over {MAX_CHARS} chars:")
        for path, s, n, t in long_cues:
            print(f"  {path} [{s}s | {n}c]: {t}")
    else:
        print(f"\nAll cues <= {MAX_CHARS} chars.")


if __name__ == "__main__":
    main()
