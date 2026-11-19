import type { Settings } from "./types.js";

/**
 * Starting values. Per page at weight 1.0:
 * 3 min reading + 1 min summary + 1.5 cards × 1.5 min ≈ 6.25 min.
 */
export const DEFAULT_SETTINGS: Settings = {
  sessionMinutes: 150,
  preferredSessionsPerDay: 2,
  maxSessionsPerDay: 3,
  maxChunksPerSession: 3,
  maxPagesPerChunk: 25,
  maxSlidesPerChunk: 60,
  examBufferDays: 2,
  reviewShare: 0.1,
  rates: {
    readPerPage: 3,
    readPerSlide: 1,
    summaryPerPage: 1,
    summaryPerSlide: 0.5,
    cardsPerPage: 1.5,
    cardsPerSlide: 0.7,
    minutesPerCard: 1.5,
  },
  anki: {
    minMinutesPerSession: 10,
    maxShareOfSession: 0.3,
    dueFractionPerDay: 0.1,
    secondsPerReview: 8,
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
  };
}
