import type { ISODate } from "./dates.js";
import type { Plan } from "./types.js";

export interface PlanChange {
  chunkId: string;
  title: string;
  /** Dates the chunk was planned on before (from the new plan's start). */
  before: ISODate[];
  after: ISODate[];
}

/** Which chunks moved between two plans, for "Moved Ch. 3 to Wednesday" notes. */
export function diffPlans(before: Plan, after: Plan): PlanChange[] {
  const collect = (plan: Plan) => {
    const map = new Map<string, { title: string; dates: Set<ISODate> }>();
    for (const session of plan.sessions) {
      if (session.date < after.from) continue;
      for (const item of session.items) {
        if (item.kind === "anki") continue;
        let entry = map.get(item.chunkId);
        if (!entry) map.set(item.chunkId, (entry = { title: item.baseTitle, dates: new Set() }));
        entry.dates.add(session.date);
      }
    }
    return map;
  };

  const a = collect(before);
  const b = collect(after);
  const changes: PlanChange[] = [];
  for (const id of new Set([...a.keys(), ...b.keys()])) {
    const oldDates = [...(a.get(id)?.dates ?? [])].sort();
    const newDates = [...(b.get(id)?.dates ?? [])].sort();
    if (oldDates.join() !== newDates.join()) {
      changes.push({
        chunkId: id,
        title: (b.get(id) ?? a.get(id))!.title,
        before: oldDates,
        after: newDates,
      });
    }
  }
  return changes;
}
