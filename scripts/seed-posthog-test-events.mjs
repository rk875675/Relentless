/**
 * Sends synthetic test events to PostHog to populate analytics graphs.
 *
 * Usage:
 *   node scripts/seed-posthog-test-events.mjs
 *
 * Requires POSTHOG_PROJECT_API_KEY env var (the project API / write key).
 * This is the public token (phc_...) visible in PostHog project settings.
 * NOT the private API key — this only needs write access.
 */

const API_KEY = process.env.POSTHOG_PROJECT_API_KEY;
if (!API_KEY) {
  console.error(
    'Set POSTHOG_PROJECT_API_KEY (your phc_... project token) in your environment.',
  );
  process.exit(1);
}

const POSTHOG_HOST = 'https://us.i.posthog.com';

// --- Helpers ---

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pastTimestamp(daysAgo) {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(randomInt(6, 23), randomInt(0, 59), randomInt(0, 59));
  return d.toISOString();
}

async function sendBatch(events) {
  const res = await fetch(`${POSTHOG_HOST}/batch/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ api_key: API_KEY, batch: events }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PostHog batch failed (${res.status}): ${text}`);
  }
}

// --- Config ---

const COACHES = ['grant-chiasson', 'james-goodall', 'iaia-colella'];
const PROGRAMS = [
  '30-day-sprint',
  'race-ready-a-7-day-mental-performance-challenge',
  'the-8-mental-dimensions-of-performance',
];
const ONBOARDING_STEPS = [
  'welcome',
  'sport_select',
  'goal_select',
  'competition_date',
  'grant_video',
  'grant_journal',
  'paywall',
];
const APP_VERSIONS = ['1.0.0', '1.1.0', '1.2.0', '1.3.0'];
const BLOCK_TYPES = [
  'breathing',
  'body_scan',
  'visualization',
  'text_card',
  'typed_entry',
  'multi_select',
];
const TABS = ['home', 'library', 'profile'];

const NUM_USERS = 8;
const DAYS_BACK = 30;

// --- Generate users ---

const users = Array.from({ length: NUM_USERS }, (_, i) => ({
  distinct_id: `test-user-${i + 1}-${uuid().slice(0, 8)}`,
  appVersion: randomChoice(APP_VERSIONS),
}));

// --- Build events ---

const allEvents = [];

function event(distinctId, eventName, properties, timestamp) {
  allEvents.push({
    event: eventName,
    distinct_id: distinctId,
    timestamp,
    properties: {
      ...properties,
      $lib: 'posthog-test-seed',
    },
  });
}

for (const user of users) {
  const dayOffset = randomInt(1, DAYS_BACK);
  const props = { $app_version: user.appVersion };

  // Onboarding flow (all users go through it)
  const obTimestamp = pastTimestamp(dayOffset);
  event(user.distinct_id, 'onboarding_started', props, obTimestamp);

  // Some exit during onboarding
  const exitStep = randomChoice(ONBOARDING_STEPS);
  const exitIdx = ONBOARDING_STEPS.indexOf(exitStep);
  for (let i = 0; i <= exitIdx; i++) {
    event(
      user.distinct_id,
      'onboarding_screen_viewed',
      { ...props, step_key: ONBOARDING_STEPS[i] },
      pastTimestamp(dayOffset),
    );
  }
  // 40% exit before paywall
  if (Math.random() < 0.4 && exitStep !== 'paywall') {
    event(
      user.distinct_id,
      'onboarding_screen_exited',
      { ...props, step_key: exitStep },
      pastTimestamp(dayOffset),
    );
    continue; // user doesn't complete onboarding
  }

  // Reach paywall
  event(
    user.distinct_id,
    'onboarding_paywall_viewed',
    props,
    pastTimestamp(dayOffset),
  );

  // 50% start trial
  if (Math.random() < 0.5) {
    event(user.distinct_id, 'paywall_presented', props, pastTimestamp(dayOffset));
    event(user.distinct_id, 'purchase_started', props, pastTimestamp(dayOffset));
    event(user.distinct_id, 'purchase_completed', props, pastTimestamp(dayOffset));
    event(user.distinct_id, 'trial_started', props, pastTimestamp(dayOffset));
    event(user.distinct_id, 'signup_completed', props, pastTimestamp(dayOffset));
    event(user.distinct_id, 'onboarding_completed', props, pastTimestamp(dayOffset));

    // 30% cancel trial
    if (Math.random() < 0.3) {
      event(
        user.distinct_id,
        'trial_cancelled',
        props,
        pastTimestamp(dayOffset - randomInt(1, 5)),
      );
    }
  } else {
    event(
      user.distinct_id,
      'onboarding_screen_exited',
      { ...props, step_key: 'paywall' },
      pastTimestamp(dayOffset),
    );
    event(user.distinct_id, 'paywall_dismissed', props, pastTimestamp(dayOffset));
  }

  // Daily activity (for users who completed onboarding)
  for (let day = 0; day < randomInt(3, DAYS_BACK); day++) {
    const ts = pastTimestamp(day);
    const coach = randomChoice(COACHES);
    const program = randomChoice(PROGRAMS);
    const isLibrary = Math.random() < 0.2;

    // Tab switches
    event(user.distinct_id, 'tab_switched', { ...props, tab_name: 'home' }, ts);
    if (Math.random() < 0.3) {
      event(
        user.distinct_id,
        'tab_switched',
        { ...props, tab_name: 'library' },
        ts,
      );
    }
    if (Math.random() < 0.1) {
      event(
        user.distinct_id,
        'tab_switched',
        { ...props, tab_name: 'profile' },
        ts,
      );
    }

    // WOD viewed + maybe start lesson
    event(user.distinct_id, 'wod_viewed', props, ts);
    if (Math.random() < 0.7) {
      event(user.distinct_id, 'wod_started', { ...props, program_day: day + 1, time_of_day_hour: randomInt(6, 22) }, ts);

      const lessonId = uuid();
      const lessonProps = {
        ...props,
        lesson_id: lessonId,
        program_id: isLibrary ? null : uuid(),
        program_key: isLibrary ? null : program,
        coach_key: isLibrary ? null : coach,
        lesson_type: isLibrary ? 'library' : 'program',
        program_day: isLibrary ? null : day + 1,
        time_of_day_hour: randomInt(6, 22),
      };

      event(user.distinct_id, 'lesson_started', lessonProps, ts);

      // Exercise blocks
      const numBlocks = randomInt(2, 5);
      for (let b = 0; b < numBlocks; b++) {
        const blockType = randomChoice(BLOCK_TYPES);
        const blockProps = {
          ...props,
          lesson_id: lessonId,
          program_id: lessonProps.program_id,
          block_index: b,
          block_type: blockType,
          interactive_model: blockType,
          duration_seconds: randomInt(30, 180),
        };
        event(user.distinct_id, 'exercise_block_started', blockProps, ts);

        // 85% complete the block
        if (Math.random() < 0.85) {
          event(
            user.distinct_id,
            'exercise_block_completed',
            { ...blockProps, actual_elapsed_seconds: randomInt(25, 200) },
            ts,
          );
        }
      }

      // 75% complete the lesson
      if (Math.random() < 0.75) {
        event(
          user.distinct_id,
          'lesson_completed',
          {
            ...lessonProps,
            block_count: numBlocks,
            session_duration_seconds: randomInt(120, 600),
          },
          ts,
        );

        // Streak extended
        event(
          user.distinct_id,
          'streak_extended',
          { ...props, new_streak_count: day + 1, program_day: day + 1 },
          ts,
        );

        // Journal prompt
        const answered = Math.random() < 0.6;
        event(user.distinct_id, 'journal_prompt_completed', {
          ...props,
          lesson_id: lessonId,
          prompt_type: 'lesson_reflection',
          answered,
          entry_length: answered ? randomInt(20, 300) : 0,
        }, ts);
      } else {
        // Lesson abandoned
        event(user.distinct_id, 'lesson_abandoned', {
          ...lessonProps,
          block_index: randomInt(0, numBlocks - 1),
          block_type: randomChoice(BLOCK_TYPES),
          elapsed_seconds: randomInt(30, 180),
          exit_reason: randomChoice(['back_button', 'os_background_exit']),
        }, ts);
      }
    }
  }

  // Push reminders (some users)
  if (Math.random() < 0.5) {
    event(
      user.distinct_id,
      'push_reminders_enabled',
      { ...props, source: randomChoice(['profile_toggle', 'home_prompt']) },
      pastTimestamp(randomInt(1, DAYS_BACK)),
    );
  }
}

// --- Send ---

const BATCH_SIZE = 100;
console.log(`Sending ${allEvents.length} test events in batches of ${BATCH_SIZE}...`);

for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
  const batch = allEvents.slice(i, i + BATCH_SIZE);
  await sendBatch(batch);
  console.log(`  Sent ${Math.min(i + BATCH_SIZE, allEvents.length)}/${allEvents.length}`);
}

console.log('Done! Events should appear in PostHog within 1-2 minutes.');
console.log('Test user IDs:');
users.forEach((u) => console.log(`  ${u.distinct_id} (v${u.appVersion})`));
