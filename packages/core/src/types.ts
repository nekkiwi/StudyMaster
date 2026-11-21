import type { ISODate } from "./dates.js";

export type { ISODate };

/** Difficulty presets: easier subjects take less effort per page. */
export type Weight = 0.5 | 0.8 | 1 | 1.2 | 1.5;
export const WEIGHTS: readonly Weight[] = [0.5, 0.8, 1, 1.2, 1.5];

/**
 * A day has up to four sessions: two in the morning, two in the afternoon.
 * With fewer sessions per day the planner uses them in this order:
 * 1 → am1 · 2 → am1, pm1 · 3 → am1, am2, pm1 · 4 → all.
 */
export type SlotId = "am1" | "am2" | "pm1" | "pm2";
export type Half = "am" | "pm";

export interface Subject {
  id: string;
  name: string;
  color?: string;
  weight: Weight;
  examDate: ISODate;
  /** When the exam takes place on exam day. Defaults to "am". */
  examHalf?: Half;
}

/**
 * Every chunk (usually one lecture) is worked through in this order:
 * watch the lecture recording → read the chapter / slide deck → write Anki cards.
 * Studying the cards (learning new + reviewing old) is a separate Anki item.
 */
export type StepKey = "watch" | "read" | "cards";
export const STEPS: readonly StepKey[] = ["watch", "read", "cards"];

/** One study unit, usually a lecture: recording + chapter and/or slide deck. */
export interface Chunk {
  id: string;
  subjectId: string;
  title: string;
  pages: number;
  slides: number;
  /** Length of the lecture recording in minutes (0 or missing = none). */
  recordingMinutes?: number;
  /** Position inside the subject; chunks are studied in this order. */
  order: number;
  /** Actual number of Anki cards made (overrides the estimate once known). */
  cards?: number;
  /** Fraction (0–1) of each step already done. Missing = 0. */
  done?: Partial<Record<StepKey, number>>;
}

export type BlockReason = "vacation" | "sick" | "break" | "other";

/** Days that can never be used for studying. Both ends inclusive. */
export interface BlockedRange {
  id: string;
  start: ISODate;
  end: ISODate;
  reason: BlockReason;
  note?: string;
}

/** Minutes per page/slide for each step, before the subject weight. */
export interface Rates {
  /**
   * Watching time per recording minute: 1 = real time, 0.8 = at 1.25× speed,
   * 1.2 = with pauses for notes. Not affected by the subject weight.
   */
  recordingFactor: number;
  readPerPage: number;
  readPerSlide: number;
  cardsPerPage: number;
  cardsPerSlide: number;
  minutesPerCard: number;
}

export interface AnkiSettings {
  /** Every study session ends with at least this much Anki review. */
  minMinutesPerSession: number;
  /** Anki never takes more than this share of a session (0–1). */
  maxShareOfSession: number;
  /** Rough share of all existing cards that are due on a given day. */
  dueFractionPerDay: number;
  secondsPerReview: number;
  /** Time to learn one new card (all its first repetitions together). */
  secondsPerNewCard: number;
}

/**
 * One half-day per week is planned empty. It is a catch-up reserve: the
 * planner only puts work there when you fell behind, and only with approval.
 */
export interface WeeklyBuffer {
  enabled: boolean;
  /** "auto" = afternoon of the last available day of each week. */
  when: "auto" | { weekday: number; half: Half };
}

export type SessionCount = 1 | 2 | 3 | 4;

/** Sessions in one half-day: none, one, or two. */
export type HalfDaySessions = 0 | 1 | 2;

/** When you study on one weekday: sessions in the morning and the afternoon. */
export interface DayPlan {
  am: HalfDaySessions;
  pm: HalfDaySessions;
}

/** Your normal week, indexed by weekday: 0 = Sunday … 6 = Saturday. */
export type WeekPlan = [DayPlan, DayPlan, DayPlan, DayPlan, DayPlan, DayPlan, DayPlan];

/**
 * even  = spread each subject's work steadily until its finish date
 *         (Anki keeps running every day, less cramming early on)
 * early = finish material as soon as possible, then only reviews
 */
export type Pacing = "even" | "early";

export interface Settings {
  /** Length of one session in minutes (2–3 h). */
  sessionMinutes: number;
  /**
   * Your normal week: which half-days you study and how many sessions.
   * Days and half-days without sessions are free – nothing is planned there.
   */
  week: WeekPlan;
  /**
   * On days you study, the plan may go up to this many sessions in total –
   * only after you approve (extra sessions). Free days stay free.
   */
  maxSessionsPerDay: SessionCount;
  maxChunksPerSession: number;
  /** Bigger chunks are split automatically. */
  maxPagesPerChunk: number;
  maxSlidesPerChunk: number;
  /** Main study for a subject ends this many days before its exam. */
  examBufferDays: number;
  /** Length of the pre-exam review session, as a share of the subject's effort. */
  reviewShare: number;
  pacing: Pacing;
  /** Recording length suggested when adding new chunks (UI default). */
  defaultRecordingMinutes: number;
  rates: Rates;
  anki: AnkiSettings;
  weeklyBuffer: WeeklyBuffer;
}

export interface StudyState {
  subjects: Subject[];
  chunks: Chunk[];
  blocked: BlockedRange[];
  settings: Settings;
}

/**
 * normal = within the preferred sessions per day
 * buffer = the weekly catch-up half-day (empty unless approved)
 * extra  = above preferred, up to max sessions per day (only with approval)
 */
export type SlotKind = "normal" | "buffer" | "extra";

export interface Slot {
  date: ISODate;
  slot: SlotId;
  kind: SlotKind;
}

/**
 * What a plan item is about:
 * chapter = pages · slides = a slide deck · mixed = pages and slides ·
 * recording = only a lecture recording · anki = studying Anki cards
 * (not tied to a chunk)
 */
export type ItemKind = "chapter" | "slides" | "mixed" | "recording" | "anki";

/** One thing to do in a session: a piece of a chunk, or studying Anki. */
export interface PlanItem {
  kind: ItemKind;
  /** The chunk this piece belongs to. For Anki items: "anki@<slot>". */
  chunkId: string;
  /** Empty for Anki items (they can cover several subjects, see `decks`). */
  subjectId: string;
  /** Chunk title without the part suffix. */
  baseTitle: string;
  /** Display title, e.g. "Lecture 4 (2/3)". */
  title: string;
  part: number;
  parts: number;
  /** Working time of this item (for chunk pieces: watch + read + write cards). */
  minutes: number;
  /** Minutes per step in this piece, in order (watch → read → cards). */
  steps: Record<StepKey, number>;
  /** Pages and slides to read in this piece. */
  pages: number;
  slides: number;
  /** Estimated Anki cards written in this piece. */
  cards: number;
  /**
   * Time to learn this piece's new cards. Counted in the session's Anki item,
   * so it's not part of `minutes`, but it does take room in the session.
   */
  learnMinutes: number;
  /** How much of each step this piece completes (added to Chunk.done). */
  deltas: Record<StepKey, number>;
  /** Anki items: subjects whose decks to study, most important first. */
  decks?: string[];
  /** Anki items: what the time is for. */
  anki?: {
    newCards: number;
    learnMinutes: number;
    reviewMinutes: number;
    /** Lectures whose cards were written in this session (their decks are "Subject::Lecture"). */
    lectures: { subjectId: string; title: string }[];
  };
}

/**
 * study  = chunk work (watch → read → write cards), then studying Anki
 *          (the new cards + reviews of the same subjects)
 * review = Anki for the subject + a short exam review right before an exam
 * anki   = only Anki (days without study, so reviews never pause)
 */
export type SessionType = "study" | "review" | "anki";

export interface PlannedSession extends Slot {
  type: SessionType;
  /** In order. Study sessions end with an Anki item; review and Anki-only
   *  sessions start with one. */
  items: PlanItem[];
  /** For review sessions: the subject whose exam is next. */
  reviewSubjectId?: string;
  reviewMinutes?: number;
}

export interface SubjectStatus {
  subjectId: string;
  /** Last date (exclusive) for main study. */
  finishBy: ISODate;
  remainingMinutes: number;
  scheduledMinutes: number;
  deficitMinutes: number;
  hasReview: boolean;
  lastStudyDate?: ISODate;
}

export interface Plan {
  from: ISODate;
  sessions: PlannedSession[];
  /** Weekly buffer slots that stay empty. */
  bufferSlots: Slot[];
  /** Work that did not fit before its deadline. */
  unscheduled: PlanItem[];
  subjects: SubjectStatus[];
  feasible: boolean;
}

/** How far the planner had to go to fit everything (see planWithEscalation). */
export type EscalationLevel =
  | "normal"
  | "shortenExamBuffer"
  | "useWeeklyBuffer"
  | "extraSessions"
  | "infeasible";

export interface PlanResult {
  plan: Plan;
  level: EscalationLevel;
  /** true when the plan uses anything the user has to agree to first. */
  needsApproval: boolean;
  examBufferDays: number;
  usedBufferSlots: Slot[];
  usedExtraSlots: Slot[];
  warnings: string[];
}
