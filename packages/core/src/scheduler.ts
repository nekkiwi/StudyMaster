import { addDays, type ISODate } from "./dates.js";
import {
  ankiItem,
  ankiMinutesPerDay,
  ankiMinutesPerSession,
  cardsMade,
  cutItem,
  itemCost,
  isAnkiItem,
  splitChunk,
  totalMinutes,
} from "./effort.js";
import { buildSlotGrid, slotKey } from "./slots.js";
import type {
  EscalationLevel,
  Plan,
  PlanItem,
  PlannedSession,
  PlanResult,
  Slot,
  StepKey,
  StudyState,
  Subject,
  SubjectStatus,
} from "./types.js";

export interface PlanOptions {
  /** Main study ends this many days before each exam. */
  examBufferDays: number;
  /** Allow catch-up work in the weekly buffer half-day. */
  useWeeklyBuffer: boolean;
  /** Allow sessions above the preferred count (up to max). */
  useExtraSessions: boolean;
}

/** Review sessions are placed at most this many days before the exam. */
const REVIEW_LOOKBACK_DAYS = 7;
const MIN_REVIEW_MINUTES = 20;
/** Reviews stay short: at most this share of a session. */
const MAX_REVIEW_SHARE = 0.6;
/** Don't start a new piece in a session with less time left than this. */
const MIN_FRAGMENT_MINUTES = 30;
/** A piece may run over by this much instead of leaving a tiny leftover. */
const TAIL_TOLERANCE = 10;
/** Anki-only sessions on days without study are at least this long. */
const ANKI_ONLY_MIN_MINUTES = 15;
/** Exams this close count as "coming up" when choosing Anki decks. */
const FOCUS_DAYS = 14;
const MAX_DECKS = 3;

/**
 * Builds one plan from `from` (inclusive) until the last exam.
 *
 * 1. Build the slot grid (blocked days, exam halves, buffer and extra slots).
 * 2. Reserve a short review session right before every exam, first, so
 *    back-to-back exams still get one each.
 * 3. Walk the slots in time order. Each study session gets work (watch →
 *    read → write cards) from the subject with the least slack
 *    (free capacity before its deadline minus remaining work), and ends
 *    with Anki: learning the new cards + reviewing that subject's cards.
 *    Buffer and extra slots are only used by subjects that would not
 *    make it otherwise.
 * 4. Days without any session get a short Anki-only session, so reviews
 *    never pause.
 */
export function planOnce(state: StudyState, from: ISODate, options: PlanOptions): Plan {
  const s = state.settings;
  const subjects = state.subjects
    .filter((x) => x.examDate >= from)
    .sort((a, b) => a.examDate.localeCompare(b.examDate) || a.id.localeCompare(b.id));

  if (subjects.length === 0) {
    return { from, sessions: [], bufferSlots: [], unscheduled: [], subjects: [], feasible: true };
  }

  const lastExam = subjects[subjects.length - 1]!.examDate;
  const grid = buildSlotGrid(state, from, lastExam);
  const usable = (slot: Slot) =>
    slot.kind === "normal" ||
    (slot.kind === "buffer" && options.useWeeklyBuffer) ||
    (slot.kind === "extra" && options.useExtraSessions);

  // Preferred sessions per day, to split the daily Anki load between them.
  const sessionsPerDay = new Map<ISODate, number>();
  for (const slot of grid) {
    if (slot.kind !== "extra") {
      sessionsPerDay.set(slot.date, (sessionsPerDay.get(slot.date) ?? 0) + 1);
    }
  }

  // Work queues per subject, in chunk order.
  const queues = new Map<string, PlanItem[]>();
  const remaining = new Map<string, number>();
  const fullEffort = new Map<string, number>();
  for (const subject of subjects) {
    const chunks = state.chunks
      .filter((c) => c.subjectId === subject.id)
      .sort((a, b) => a.order - b.order);
    const queue = chunks.flatMap((c) => splitChunk(c, subject, s));
    queues.set(subject.id, queue);
    remaining.set(subject.id, queue.reduce((sum, x) => sum + itemCost(x), 0));
    fullEffort.set(
      subject.id,
      chunks.reduce((sum, c) => sum + totalMinutes(c, subject, s), 0),
    );
  }
  const initialRemaining = new Map(remaining);

  // Step 2: review sessions.
  const reviews = new Map<string, PlannedSession>();
  const reviewKeyOf = new Map<string, string>();
  for (const subject of subjects) {
    if ((fullEffort.get(subject.id) ?? 0) <= 0) continue;
    const slot = pickReviewSlot(subject, grid, usable, reviews);
    if (!slot) continue;
    const key = slotKey(slot.date, slot.slot);
    const minutes = Math.min(
      s.sessionMinutes * MAX_REVIEW_SHARE,
      Math.max(MIN_REVIEW_MINUTES, s.reviewShare * fullEffort.get(subject.id)!),
    );
    reviews.set(key, {
      ...slot,
      type: "review",
      items: [],
      reviewSubjectId: subject.id,
      reviewMinutes: Math.round(minutes),
    });
    reviewKeyOf.set(subject.id, key);
  }

  // Deadlines: before the review session and before exam − buffer days.
  const deadlineKey = new Map<string, string>();
  for (const subject of subjects) {
    const finishBy = addDays(subject.examDate, -options.examBufferDays);
    const byBuffer = slotKey(finishBy, "am1");
    const byReview = reviewKeyOf.get(subject.id);
    deadlineKey.set(subject.id, byReview && byReview < byBuffer ? byReview : byBuffer);
  }

  // Slots that can take study work, and a prefix count of normal ones.
  const fillSlots = grid.filter((x) => usable(x) && !reviews.has(slotKey(x.date, x.slot)));
  const prefixNormal = [0];
  const prefixBuffer = [0];
  for (const slot of fillSlots) {
    prefixNormal.push(prefixNormal[prefixNormal.length - 1]! + (slot.kind === "normal" ? 1 : 0));
    prefixBuffer.push(prefixBuffer[prefixBuffer.length - 1]! + (slot.kind === "buffer" ? 1 : 0));
  }
  const deadlineIndex = new Map<string, number>();
  for (const subject of subjects) {
    const dk = deadlineKey.get(subject.id)!;
    deadlineIndex.set(
      subject.id,
      fillSlots.filter((x) => slotKey(x.date, x.slot) < dk).length,
    );
  }
  const between = (prefix: number[], a: number, b: number) =>
    b > a ? prefix[b]! - prefix[a]! : 0;

  // Step 3: walk the grid in time order.
  let activeCards = state.chunks.reduce((sum, c) => sum + cardsMade(c, s), 0);
  let pendingCards = 0;
  let currentDate = "";
  let anki = 0;
  let fillIndex = 0;
  const sessions: PlannedSession[] = [];
  const cardsOnDate = new Map<ISODate, number>();

  // Decks for Anki-only days: subjects with an exam coming up, else all.
  const decksFor = (date: ISODate): string[] => {
    const upcoming = subjects
      .filter((x) => x.examDate >= date && x.examDate <= addDays(date, FOCUS_DAYS))
      .map((x) => x.id);
    return (upcoming.length > 0 ? upcoming : subjects.map((x) => x.id)).slice(0, MAX_DECKS);
  };

  for (const slot of grid) {
    if (slot.date !== currentDate) {
      currentDate = slot.date;
      activeCards += pendingCards;
      pendingCards = 0;
      cardsOnDate.set(slot.date, activeCards);
      anki = ankiMinutesPerSession(activeCards, sessionsPerDay.get(slot.date) ?? 1, s);
    }
    const key = slotKey(slot.date, slot.slot);
    const review = reviews.get(key);
    if (review) {
      review.items = [ankiItem(slot.slot, [review.reviewSubjectId!], { reviewMinutes: anki })];
      sessions.push(review);
      continue;
    }
    if (!usable(slot)) continue;

    const index = fillIndex++;
    const capacity = s.sessionMinutes - anki;
    let capLeft = capacity;
    const items: PlanItem[] = [];

    while (items.length < s.maxChunksPerSession) {
      let best: Subject | undefined;
      let bestSlack = Infinity;
      for (const subject of subjects) {
        const queue = queues.get(subject.id)!;
        const next = queue[0];
        if (!next) continue;
        if (key >= deadlineKey.get(subject.id)!) continue;
        // A piece that doesn't fit is cut to fill the rest of the session,
        // but only if the rest is long enough to be worth starting.
        const nextCost = itemCost(next);
        if (nextCost > capLeft + TAIL_TOLERANCE && capLeft < MIN_FRAGMENT_MINUTES) continue;

        // What one future session holds for this subject (max pieces per session).
        const perSlot = Math.min(capacity, s.maxChunksPerSession * nextCost);
        const end = deadlineIndex.get(subject.id)!;
        const normalAhead = between(prefixNormal, index + 1, end) * perSlot;
        const bufferAhead = between(prefixBuffer, index + 1, end) * perSlot;
        const left = remaining.get(subject.id)!;
        let slack: number;
        if (slot.kind === "normal") {
          slack = capLeft + normalAhead - left;
          // Even pacing: only take this slot if the subject is behind its
          // steady pace, or if time is getting tight (then it's ASAP again).
          if (s.pacing === "even" && slack > perSlot) {
            const slotsTotal = prefixNormal[end]!;
            const total = initialRemaining.get(subject.id)!;
            const quota = slotsTotal > 0 ? (total * prefixNormal[index + 1]!) / slotsTotal : Infinity;
            if (total - left >= quota - 1e-6) continue;
          }
          // Fewer subject switches inside a session: stay with the current
          // subject unless another one is actually at risk (slack < 0).
          const current = items[items.length - 1]?.subjectId;
          if (subject.id === current && slack > 0) slack = Math.max(0, slack - capacity);
        } else {
          // Buffer is used before extra sessions: an extra slot only counts
          // as needed if the remaining buffer slots wouldn't be enough either.
          slack = normalAhead + (slot.kind === "extra" ? bufferAhead : 0) - left;
          if (slack >= 0) continue; // would make it without this slot
        }
        if (
          slack < bestSlack - 1e-9 ||
          (Math.abs(slack - bestSlack) <= 1e-9 &&
            best &&
            deadlineKey.get(subject.id)! < deadlineKey.get(best.id)!)
        ) {
          best = subject;
          bestSlack = slack;
        }
      }
      if (!best) break;

      const queue = queues.get(best.id)!;
      let item = queue[0]!;
      if (itemCost(item) > capLeft + TAIL_TOLERANCE) {
        // Leave a leftover of at least MIN_FRAGMENT_MINUTES for next time.
        const headCost = Math.min(capLeft, itemCost(item) - MIN_FRAGMENT_MINUTES);
        if (headCost < MIN_FRAGMENT_MINUTES) break;
        const [head, tail] = cutItem(item, headCost);
        queue[0] = tail;
        item = head;
      } else {
        queue.shift();
      }
      items.push(item);
      capLeft -= itemCost(item);
      remaining.set(best.id, remaining.get(best.id)! - itemCost(item));
      pendingCards += item.cards;
    }

    if (items.length > 0) {
      // Work first (watch → read → write cards), then Anki: learn the new
      // cards and review earlier cards of the same subjects.
      const work = mergeSameChunk(items);
      const anki_ = ankiItem(slot.slot, [...new Set(work.map((x) => x.subjectId))], {
        reviewMinutes: anki,
        learnMinutes: work.reduce((sum, x) => sum + x.learnMinutes, 0),
        newCards: work.reduce((sum, x) => sum + x.cards, 0),
      });
      sessions.push({ ...slot, type: "study", items: [...work.map(roundItem), anki_] });
    }
  }

  // Step 4: Anki-only sessions on days without any other session.
  const busyDays = new Set(sessions.map((x) => x.date));
  const examDays = new Set(subjects.map((x) => x.examDate));
  for (const slot of grid) {
    if (slot.kind !== "normal" || busyDays.has(slot.date) || examDays.has(slot.date)) continue;
    busyDays.add(slot.date);
    const cards = cardsOnDate.get(slot.date) ?? 0;
    if (cards < 1) continue;
    const minutes = Math.min(
      s.sessionMinutes * s.anki.maxShareOfSession,
      Math.max(ANKI_ONLY_MIN_MINUTES, ankiMinutesPerDay(cards, s)),
    );
    sessions.push({ ...slot, type: "anki", items: [ankiItem(slot.slot, decksFor(slot.date), { reviewMinutes: minutes })] });
  }
  sessions.sort((a, b) => slotKey(a.date, a.slot).localeCompare(slotKey(b.date, b.slot)));

  const unscheduled = subjects.flatMap((x) => queues.get(x.id)!.map(roundItem));
  relabelParts([...sessions.flatMap((x) => x.items).filter((x) => !isAnkiItem(x)), ...unscheduled]);
  const statuses: SubjectStatus[] = subjects.map((subject) => {
    const deficit = queues.get(subject.id)!.reduce((sum, x) => sum + itemCost(x), 0);
    const total = initialRemaining.get(subject.id)!;
    const studyDates = sessions
      .filter((x) => x.items.some((i) => i.subjectId === subject.id))
      .map((x) => x.date);
    return {
      subjectId: subject.id,
      finishBy: addDays(subject.examDate, -options.examBufferDays),
      remainingMinutes: Math.round(total),
      scheduledMinutes: Math.round(total - deficit),
      deficitMinutes: Math.round(deficit),
      hasReview: reviewKeyOf.has(subject.id),
      lastStudyDate: studyDates[studyDates.length - 1],
    };
  });

  const usedKeys = new Set(sessions.map((x) => slotKey(x.date, x.slot)));
  return {
    from,
    sessions,
    bufferSlots: grid.filter((x) => x.kind === "buffer" && !usedKeys.has(slotKey(x.date, x.slot))),
    unscheduled,
    subjects: statuses,
    feasible: unscheduled.reduce((sum, x) => sum + itemCost(x), 0) < 1,
  };
}

/** The latest free slot before the exam, preferring a normal session on that day. */
function pickReviewSlot(
  subject: Subject,
  grid: Slot[],
  usable: (slot: Slot) => boolean,
  taken: Map<string, PlannedSession>,
): Slot | undefined {
  const examKey = slotKey(subject.examDate, (subject.examHalf ?? "am") === "am" ? "am1" : "pm1");
  const earliest = addDays(subject.examDate, -REVIEW_LOOKBACK_DAYS);
  const candidates = grid.filter(
    (x) =>
      usable(x) &&
      x.date >= earliest &&
      slotKey(x.date, x.slot) < examKey &&
      !taken.has(slotKey(x.date, x.slot)),
  );
  if (candidates.length === 0) return undefined;
  const lastDate = candidates[candidates.length - 1]!.date;
  const sameDay = candidates.filter((x) => x.date === lastDate);
  const normal = sameDay.filter((x) => x.kind === "normal");
  const pool = normal.length > 0 ? normal : sameDay;
  return pool[pool.length - 1];
}

/** Back-to-back pieces of the same chunk in one session become one item. */
function mergeSameChunk(items: PlanItem[]): PlanItem[] {
  const out: PlanItem[] = [];
  for (const item of items) {
    const last = out[out.length - 1];
    if (last && last.chunkId === item.chunkId) {
      const sum = (k: StepKey) => ({ steps: last.steps[k] + item.steps[k], deltas: last.deltas[k] + item.deltas[k] });
      out[out.length - 1] = {
        ...last,
        minutes: last.minutes + item.minutes,
        pages: last.pages + item.pages,
        slides: last.slides + item.slides,
        cards: last.cards + item.cards,
        learnMinutes: last.learnMinutes + item.learnMinutes,
        steps: { watch: sum("watch").steps, read: sum("read").steps, cards: sum("cards").steps },
        deltas: { watch: sum("watch").deltas, read: sum("read").deltas, cards: sum("cards").deltas },
      };
    } else {
      out.push(item);
    }
  }
  return out;
}

/** Numbers the pieces of each chunk in time order: "Ch 4 (1/3)", "Ch 4 (2/3)" … */
function relabelParts(items: PlanItem[]): void {
  const byChunk = new Map<string, PlanItem[]>();
  for (const item of items) {
    let list = byChunk.get(item.chunkId);
    if (!list) byChunk.set(item.chunkId, (list = []));
    list.push(item);
  }
  for (const list of byChunk.values()) {
    list.forEach((item, i) => {
      item.part = i + 1;
      item.parts = list.length;
      item.title = list.length > 1 ? `${item.baseTitle} (${i + 1}/${list.length})` : item.baseTitle;
    });
  }
}

/** Whole minutes, pages, slides and cards for display. Deltas stay exact. */
function roundItem(item: PlanItem): PlanItem {
  return {
    ...item,
    minutes: Math.round(item.minutes),
    pages: Math.round(item.pages),
    slides: Math.round(item.slides),
    cards: Math.round(item.cards),
    learnMinutes: Math.round(item.learnMinutes),
    steps: {
      watch: Math.round(item.steps.watch),
      read: Math.round(item.steps.read),
      cards: Math.round(item.steps.cards),
    },
  };
}

interface Step {
  level: Exclude<EscalationLevel, "infeasible">;
  options: PlanOptions;
}

/** Escalation levels from mildest to strongest. */
export const LEVEL_ORDER: readonly EscalationLevel[] = [
  "normal",
  "shortenExamBuffer",
  "useWeeklyBuffer",
  "extraSessions",
  "infeasible",
];

export function levelRank(level: EscalationLevel): number {
  return LEVEL_ORDER.indexOf(level);
}

/** The planner options used at each escalation level (skips levels that don't apply). */
export function escalationSteps(settings: StudyState["settings"]): Step[] {
  const s = settings;
  const shortened = Math.max(0, s.examBufferDays - 1);
  const steps: Step[] = [
    {
      level: "normal",
      options: { examBufferDays: s.examBufferDays, useWeeklyBuffer: false, useExtraSessions: false },
    },
  ];
  if (shortened < s.examBufferDays) {
    steps.push({
      level: "shortenExamBuffer",
      options: { examBufferDays: shortened, useWeeklyBuffer: false, useExtraSessions: false },
    });
  }
  if (s.weeklyBuffer.enabled) {
    steps.push({
      level: "useWeeklyBuffer",
      options: { examBufferDays: shortened, useWeeklyBuffer: true, useExtraSessions: false },
    });
  }
  if (s.maxSessionsPerDay > s.preferredSessionsPerDay) {
    steps.push({
      level: "extraSessions",
      options: {
        examBufferDays: shortened,
        useWeeklyBuffer: s.weeklyBuffer.enabled,
        useExtraSessions: true,
      },
    });
  }
  return steps;
}

/**
 * Tries to fit everything, going one step further each time:
 *
 * 1. normal            – preferred sessions only (applied automatically)
 * 2. shortenExamBuffer – main study may run one day closer to the exam
 * 3. useWeeklyBuffer   – catch up in the weekly buffer half-day
 * 4. extraSessions     – sessions above preferred, up to max per day
 *
 * Everything after step 1 needs the user's approval. If nothing fits,
 * the result is "infeasible" with the per-subject deficit.
 *
 * `maxLevel` stops the ladder early: use it to build the plan the user has
 * agreed to so far, while a stronger step waits for approval.
 */
export function planWithEscalation(
  state: StudyState,
  from: ISODate,
  maxLevel: EscalationLevel = "infeasible",
): PlanResult {
  const steps = escalationSteps(state.settings).filter(
    (x) => levelRank(x.level) <= levelRank(maxLevel),
  );
  let plan: Plan | undefined;
  let step: Step = steps[0]!;
  for (step of steps) {
    plan = planOnce(state, from, step.options);
    if (plan.feasible) return toResult(state, plan, step.level, step.options);
  }
  return toResult(state, plan!, "infeasible", step.options);
}

function toResult(
  state: StudyState,
  plan: Plan,
  level: EscalationLevel,
  options: PlanOptions,
): PlanResult {
  const names = new Map(state.subjects.map((x) => [x.id, x.name]));
  const usedBufferSlots = plan.sessions.filter((x) => x.kind === "buffer").map(toSlot);
  const usedExtraSlots = plan.sessions.filter((x) => x.kind === "extra").map(toSlot);
  const warnings: string[] = [];

  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
  if (options.examBufferDays < state.settings.examBufferDays) {
    warnings.push(
      `Main study ends ${plural(options.examBufferDays, "day")} before exams instead of ${state.settings.examBufferDays}.`,
    );
  }
  if (usedBufferSlots.length > 0) {
    warnings.push(`Uses ${plural(usedBufferSlots.length, "weekly buffer slot")} to catch up.`);
  }
  if (usedExtraSlots.length > 0) {
    warnings.push(`Needs ${plural(usedExtraSlots.length, "extra session")} above your preferred number.`);
  }
  for (const status of plan.subjects) {
    if (status.deficitMinutes > 0) {
      const hours = Math.round((status.deficitMinutes / 60) * 10) / 10;
      warnings.push(`${names.get(status.subjectId)} is ${hours} h short before its exam.`);
    }
    if (!status.hasReview && status.remainingMinutes > 0) {
      warnings.push(`No free slot for a review session right before ${names.get(status.subjectId)}.`);
    }
  }

  return {
    plan,
    level,
    needsApproval: level !== "normal",
    examBufferDays: options.examBufferDays,
    usedBufferSlots,
    usedExtraSlots,
    warnings,
  };
}

function toSlot(x: Slot): Slot {
  return { date: x.date, slot: x.slot, kind: x.kind };
}

