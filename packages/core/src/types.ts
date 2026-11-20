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

/** Every chunk is worked through in three steps. */
export type StepKey = "read" | "summary" | "cards";
export const STEPS: readonly StepKey[] = ["read", "summary", "cards"];

/** One study unit: a book chapter, a slide deck, or both. */
export interface Chunk {
  id: string;
  subjectId: string;
  title: string;
  pages: number;
  slides: number;
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
  readPerPage: number;
  readPerSlide: number;
  summaryPerPage: number;
  summaryPerSlide: number;
  cardsPerPage: number;
  cardsPerSlide: number;
  minutesPerCard: number;
}

export interface AnkiSettings {
  /** Every session starts with at least this much Anki review. */
  minMinutesPerSession: number;
  /** Anki never takes more than this share of a session (0–1). */
  maxShareOfSession: number;
  /** Rough share of all existing cards that are due on a given day. */
  dueFractionPerDay: number;
  secondsPerReview: number;
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

/**
 * even  = spread each subject's work steadily until its finish date
 *         (Anki keeps running every day, less cramming early on)
 * early = finish material as soon as possible, then only reviews
 */
export type Pacing = "even" | "early";

export interface Settings {
  /** Length of one session in minutes (2–3 h). */
  sessionMinutes: number;
  /** Sessions per day the plan normally uses. */
  preferredSessionsPerDay: SessionCount;
  /** Upper limit the planner may go to, only with approval. */
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

/** A piece of a chunk planned into a session. */
export interface PlanItem {
  chunkId: string;
  subjectId: string;
  /** Chunk title without the part suffix. */
  baseTitle: string;
  /** Display title, e.g. "Chapter 4 (2/3)". */
  title: string;
  part: number;
  parts: number;
  minutes: number;
  /** Estimated Anki cards created by this piece. */
  cards: number;
  /** How much of each step this piece completes (added to Chunk.done). */
  deltas: Record<StepKey, number>;
}

export interface PlannedSession extends Slot {
  type: "study" | "review";
  ankiMinutes: number;
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
