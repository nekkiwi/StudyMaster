import type { EscalationLevel, PlanResult } from "@studymaster/core";
import { AlertTriangle, CalendarPlus, ShieldCheck } from "lucide-react";
import { formatDay, SLOT_LABEL } from "../lib/format";
import { usedSlotKeys, type Planner } from "../planner";
import { useStore } from "../store";
import { toast } from "./toast";
import { Button, cx } from "./ui";

const TITLES: Record<EscalationLevel, string> = {
  normal: "Your plan fits",
  shortenExamBuffer: "Plan is tight: finish closer to the exams?",
  useWeeklyBuffer: "Use your weekly buffer to catch up?",
  extraSessions: "You need extra sessions to stay on track",
  infeasible: "Not everything fits before your exams",
};

function slotsText(result: PlanResult): string[] {
  return [...result.usedBufferSlots, ...result.usedExtraSlots]
    .sort((a, b) => (a.date + a.slot).localeCompare(b.date + b.slot))
    .map((s) => `${formatDay(s.date)} · ${SLOT_LABEL[s.slot]}${s.kind === "buffer" ? " (buffer)" : ""}`);
}

export function ProposalBanner({ planner }: { planner: Planner }) {
  const approve = useStore((s) => s.approve);
  const decline = useStore((s) => s.decline);
  const clearDecline = useStore((s) => s.clearDecline);
  const proposal = planner.proposal;
  if (!proposal || !planner.proposalKey) return null;

  if (planner.declined) {
    return (
      <button
        onClick={clearDecline}
        className="flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
      >
        <AlertTriangle size={18} className="shrink-0" />
        <span className="flex-1">Your plan is at risk. Tap to see the options again.</span>
      </button>
    );
  }

  const severe = proposal.level === "extraSessions" || proposal.level === "infeasible";
  const slots = slotsText(proposal);
  const onApprove = () => {
    approve({
      key: planner.proposalKey!,
      level: proposal.level,
      slots: usedSlotKeys(proposal),
      examBufferDays: proposal.examBufferDays,
    });
    toast("Plan updated.", { tone: "success" });
  };

  return (
    <div
      className={cx(
        "rounded-2xl border p-4 sm:p-5",
        severe
          ? "border-rose-200 bg-rose-50 dark:border-rose-500/30 dark:bg-rose-500/10"
          : "border-amber-200 bg-amber-50 dark:border-amber-500/30 dark:bg-amber-500/10",
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cx(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl",
            severe ? "bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-300" : "bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-300",
          )}
        >
          {severe ? <AlertTriangle size={18} /> : <CalendarPlus size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold">{TITLES[proposal.level]}</h3>
          <ul className="mt-1 space-y-0.5 text-sm text-slate-700 dark:text-slate-300">
            {proposal.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          {slots.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {slots.map((s) => (
                <span key={s} className="rounded-lg bg-white/70 px-2 py-1 text-xs font-medium dark:bg-slate-900/60">
                  {s}
                </span>
              ))}
            </div>
          )}
          {proposal.level === "infeasible" && (
            <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
              Ideas: allow more sessions per day in Settings, shorten a blocked period, or lower the weight of a subject you know well.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant={severe ? "danger" : "primary"} size="sm" onClick={onApprove}>
              <ShieldCheck size={16} /> {proposal.level === "infeasible" ? "Use best possible plan" : "Accept"}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => decline(planner.proposalKey!)}>
              Not now
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
