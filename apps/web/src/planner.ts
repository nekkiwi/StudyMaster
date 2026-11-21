import {
  addDays,
  levelRank,
  planWithEscalation,
  slotKey,
  type ISODate,
  type PlanResult,
  type StudyState,
} from "@studymaster/core";
import { useEffect, useMemo, useState } from "react";
import { todayISO } from "./lib/format";
import { useStore, type AppData } from "./store";

export interface Planner {
  today: ISODate;
  /** First day the current plan covers (may be up to 2 days back for open check-ins). */
  from: ISODate;
  state: StudyState;
  /** The plan shown to the user: only uses what they agreed to. */
  shown: PlanResult;
  /** A stronger plan that fits better, waiting for approval. */
  proposal?: PlanResult;
  proposalKey?: string;
  declined: boolean;
  /** Past days with planned work and no check-in yet. */
  pendingDays: ISODate[];
}

export function usedSlotKeys(result: PlanResult): string[] {
  return [...result.usedBufferSlots, ...result.usedExtraSlots].map((x) => slotKey(x.date, x.slot)).sort();
}

export function proposalKey(result: PlanResult): string {
  return [result.level, result.examBufferDays, ...usedSlotKeys(result)].join("|");
}

/** First day to plan from: the day after the last check-in, at most 2 days back. */
export function planStart(data: Pick<AppData, "checkIns" | "startDate">, today: ISODate): ISODate {
  const checked = Object.keys(data.checkIns).filter((d) => d >= data.startDate).sort();
  const last = checked[checked.length - 1];
  let from = last ? addDays(last, 1) : data.startDate;
  if (from < addDays(today, -2)) from = addDays(today, -2);
  if (from > addDays(today, 1)) from = addDays(today, 1);
  if (from < data.startDate) from = data.startDate;
  return from;
}

/** Due counts from Anki, without days that are already over. */
function currentDue(due: AppData["ankiDue"], today: ISODate): StudyState["ankiDue"] {
  if (!due) return undefined;
  const out: NonNullable<StudyState["ankiDue"]> = {};
  for (const [id, days] of Object.entries(due)) {
    const kept = Object.fromEntries(Object.entries(days).filter(([d]) => d >= today));
    if (Object.keys(kept).length) out[id] = kept;
  }
  return out;
}

export function computePlanner(data: AppData, today: ISODate): Planner {
  const state: StudyState = {
    subjects: data.subjects,
    chunks: data.chunks,
    blocked: data.blocked,
    settings: data.settings,
    ankiDue: currentDue(data.ankiDue, today),
  };
  const from = planStart(data, today);
  const full = planWithEscalation(state, from);

  let shown = full;
  let proposal: PlanResult | undefined;
  let key: string | undefined;
  if (full.needsApproval) {
    key = proposalKey(full);
    const a = data.approval;
    const covered =
      !!a &&
      (a.key === key ||
        (levelRank(full.level) <= levelRank(a.level) &&
          full.examBufferDays >= a.examBufferDays &&
          usedSlotKeys(full).every((x) => a.slots.includes(x))));
    if (!covered) {
      proposal = full;
      shown = planWithEscalation(state, from, "normal");
    }
  }

  const pendingDays = [...new Set(shown.plan.sessions.map((x) => x.date))]
    .filter((d) => d < today && !data.checkIns[d])
    .filter((d) => shown.plan.sessions.some((x) => x.date === d && x.items.length > 0))
    .sort();

  return {
    today,
    from,
    state,
    shown,
    proposal,
    proposalKey: key,
    declined: !!key && data.declinedKey === key,
    pendingDays,
  };
}

/** Today's date, refreshed every minute so the app rolls over at midnight. */
export function useToday(): ISODate {
  const [today, setToday] = useState(todayISO());
  useEffect(() => {
    const id = setInterval(() => setToday(todayISO()), 60_000);
    return () => clearInterval(id);
  }, []);
  return today;
}

export function usePlanner(): Planner {
  const today = useToday();
  const subjects = useStore((s) => s.subjects);
  const chunks = useStore((s) => s.chunks);
  const blocked = useStore((s) => s.blocked);
  const settings = useStore((s) => s.settings);
  const checkIns = useStore((s) => s.checkIns);
  const approval = useStore((s) => s.approval);
  const declinedKey = useStore((s) => s.declinedKey);
  const startDate = useStore((s) => s.startDate);
  const ankiDue = useStore((s) => s.ankiDue);

  return useMemo(
    () =>
      computePlanner(
        {
          subjects, chunks, blocked, settings, checkIns, approval, declinedKey, startDate, ankiDue,
          setupDone: true, checkInTime: "",
        },
        today,
      ),
    [subjects, chunks, blocked, settings, checkIns, approval, declinedKey, startDate, ankiDue, today],
  );
}
