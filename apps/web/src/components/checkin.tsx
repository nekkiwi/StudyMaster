import { itemsForDate, type ISODate, type ItemResult, type PlanItem, type StepKey, type Subject } from "@studymaster/core";
import { BookOpen, Brain, Check, NotebookPen, X } from "lucide-react";
import { useState } from "react";
import { formatLongDay, formatMinutes, relativeDays } from "../lib/format";
import type { Planner } from "../planner";
import { useStore } from "../store";
import { toast } from "./toast";
import { Button, Card, cx, Modal, SubjectDot } from "./ui";

const STEP_INFO: { key: StepKey; label: string; icon: typeof BookOpen }[] = [
  { key: "read", label: "Read", icon: BookOpen },
  { key: "summary", label: "Summary", icon: NotebookPen },
  { key: "cards", label: "Cards", icon: Brain },
];

function recordItems(items: PlanItem[], done: (item: PlanItem) => boolean) {
  return items.map((i) => ({ title: i.title, subjectId: i.subjectId, minutes: i.minutes, done: done(i) }));
}

export function CheckInCard({
  planner,
  date,
  subjects,
  prominent,
}: {
  planner: Planner;
  date: ISODate;
  subjects: Map<string, Subject>;
  prominent?: boolean;
}) {
  const checkIn = useStore((s) => s.checkIn);
  const undo = useStore((s) => s.undoCheckIn);
  const [partialOpen, setPartialOpen] = useState(false);
  const items = itemsForDate(planner.shown.plan, date);
  if (items.length === 0) return null;

  const isToday = date === planner.today;
  const question = isToday ? "Did you finish today's plan?" : `How did ${relativeDays(planner.today, date)} go?`;

  const onYes = () => {
    checkIn(date, "yes", items.map((item) => ({ item })), recordItems(items, () => true));
    toast("Nice work! Marked as done.", { tone: "success", action: { label: "Undo", run: () => undo(date) } });
  };

  return (
    <>
      <Card className={cx(prominent && "border-indigo-200 bg-gradient-to-br from-indigo-50 to-white dark:border-indigo-500/30 dark:from-indigo-500/10 dark:to-slate-900")}>
        <p className="text-xs font-medium text-indigo-600 uppercase dark:text-indigo-400">
          Check-in · {formatLongDay(date)}
        </p>
        <h3 className="mt-1 text-lg font-semibold">{question}</h3>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          {items.map((i) => i.title).join(" · ")}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="success" size="lg" onClick={onYes}>
            <Check size={18} /> Yes
          </Button>
          <Button variant="secondary" size="lg" onClick={() => setPartialOpen(true)}>
            <X size={18} /> No
          </Button>
        </div>
      </Card>
      <PartialCheckIn
        open={partialOpen}
        onClose={() => setPartialOpen(false)}
        date={date}
        items={items}
        subjects={subjects}
        onSave={(results) => {
          const doneKeys = new Set(results.map((r) => `${r.item.chunkId}-${r.item.part}`));
          checkIn(date, "no", results, recordItems(items, (i) => doneKeys.has(`${i.chunkId}-${i.part}`)));
          setPartialOpen(false);
          toast(
            results.length > 0 ? "Saved. The rest moves to the next free slots." : "No problem. Everything moves to the next free slots.",
            { action: { label: "Undo", run: () => undo(date) } },
          );
        }}
      />
    </>
  );
}

function PartialCheckIn({
  open,
  onClose,
  date,
  items,
  subjects,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  date: ISODate;
  items: PlanItem[];
  subjects: Map<string, Subject>;
  onSave: (results: ItemResult[]) => void;
}) {
  const [done, setDone] = useState<Record<string, StepKey[]>>({});
  const key = (i: PlanItem) => `${i.chunkId}-${i.part}`;

  const toggle = (item: PlanItem, step: StepKey) =>
    setDone((d) => {
      const current = d[key(item)] ?? [];
      return { ...d, [key(item)]: current.includes(step) ? current.filter((s) => s !== step) : [...current, step] };
    });

  const save = () =>
    onSave(
      items
        .filter((i) => (done[key(i)] ?? []).length > 0)
        .map((item) => ({ item, steps: done[key(item)] })),
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="What did you get done?"
      footer={
        <>
          <Button variant="ghost" onClick={() => onSave([])}>
            Nothing today
          </Button>
          <Button onClick={save}>Save</Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
        Tick what you finished on {formatLongDay(date)}. Everything else is planned again automatically.
      </p>
      <ul className="space-y-3">
        {items.map((item) => {
          const subject = subjects.get(item.subjectId);
          const steps = done[key(item)] ?? [];
          return (
            <li key={key(item)} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <SubjectDot color={subject?.color} />
                <span className="flex-1 text-sm font-medium">{item.title}</span>
                <span className="text-xs text-slate-500">{formatMinutes(item.minutes)}</span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {STEP_INFO.map(({ key: step, label, icon: Icon }) => {
                  const on = steps.includes(step);
                  return (
                    <button
                      key={step}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(item, step)}
                      className={cx(
                        "flex items-center justify-center gap-1.5 rounded-xl border py-2 text-sm font-medium transition",
                        on
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                          : "border-slate-200 text-slate-500 hover:border-slate-300 dark:border-slate-700",
                      )}
                    >
                      <Icon size={15} /> {label}
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}
