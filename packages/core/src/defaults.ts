import { ACTIVITIES, type Activity, type DayPlan, type Settings, type WeekPlan } from "./types.js";

const afternoon: DayPlan = { am: 0, pm: 2 };
const morning: DayPlan = { am: 2, pm: 0 };

/** Weekdays: afternoons. Weekend: one half-day (the morning) per day. */
export const DEFAULT_WEEK: WeekPlan = [morning, afternoon, afternoon, afternoon, afternoon, afternoon, morning];

/** The same plan for every day, e.g. everyDay(1, 1) = one morning + one afternoon session. */
export function everyDay(am: DayPlan["am"], pm: DayPlan["pm"]): WeekPlan {
  const d: DayPlan = { am, pm };
  return [d, d, d, d, d, d, d];
}

/** Every day with this many sessions, in the order am1, pm1, am2, pm2. */
export function dailySessions(count: 1 | 2 | 3 | 4): WeekPlan {
  const plans: Record<number, DayPlan> = { 1: { am: 1, pm: 0 }, 2: { am: 1, pm: 1 }, 3: { am: 2, pm: 1 }, 4: { am: 2, pm: 2 } };
  return everyDay(plans[count]!.am, plans[count]!.pm);
}

/**
 * Starting values. Per page at weight 1.0: 3 min reading + 1.5 cards × 1.5 min
 * writing ≈ 5.25 min. A lecture recording counts 1:1 (recordingFactor).
 * Learning a new card in Anki ≈ 30 s (part of the session's Anki item).
 */
export const DEFAULT_SETTINGS: Settings = {
  sessionMinutes: 150,
  // Weekday afternoons (2 sessions), one half-day on Saturday and Sunday.
  week: DEFAULT_WEEK,
  maxSessionsPerDay: 3,
  maxChunksPerSession: 3,
  maxPagesPerChunk: 25,
  maxSlidesPerChunk: 60,
  examBufferDays: 2,
  reviewShare: 0.1,
  pacing: "even",
  defaultRecordingMinutes: 60,
  // Read the material → make Anki cards → study Anki.
  workflow: ["read", "cards", "anki"],
  // 8:00–10:30, 10:30–13:00, 14:00–16:30, 16:30–19:00.
  slotTimes: {
    am1: { start: 8 * 60, end: 10 * 60 + 30 },
    am2: { start: 10 * 60 + 30, end: 13 * 60 },
    pm1: { start: 14 * 60, end: 16 * 60 + 30 },
    pm2: { start: 16 * 60 + 30, end: 19 * 60 },
  },
  rates: {
    recordingFactor: 1,
    readPerPage: 3,
    readPerSlide: 1,
    summaryPerPage: 4,
    summaryPerSlide: 1.5,
    revisePerPage: 1,
    revisePerSlide: 0.3,
    cardsPerPage: 1.5,
    cardsPerSlide: 0.7,
    minutesPerCard: 1.5,
  },
  anki: {
    minMinutesPerSession: 10,
    maxShareOfSession: 0.3,
    dueFractionPerDay: 0.1,
    secondsPerReview: 8,
    secondsPerNewCard: 30,
  },
  weeklyBuffer: { enabled: true, when: "auto" },
};

export function withDefaults(partial: Partial<Settings> = {}): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...partial,
    rates: { ...DEFAULT_SETTINGS.rates, ...partial.rates },
    anki: { ...DEFAULT_SETTINGS.anki, ...partial.anki },
    weeklyBuffer: { ...DEFAULT_SETTINGS.weeklyBuffer, ...partial.weeklyBuffer },
    week: (partial.week ?? DEFAULT_SETTINGS.week).map((d) => ({ ...d })) as WeekPlan,
    workflow: cleanWorkflow(partial.workflow ?? DEFAULT_SETTINGS.workflow),
    slotTimes: { ...DEFAULT_SETTINGS.slotTimes, ...partial.slotTimes },
  };
}

/** Known activities only, each once, order kept. */
export function cleanWorkflow(list: readonly Activity[]): Activity[] {
  return list.filter((a, i) => ACTIVITIES.includes(a) && list.indexOf(a) === i);
}
