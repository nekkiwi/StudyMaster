import type { PlannedSession, Subject } from "@studymaster/core";
import { BookOpen, Brain, Copy, Layers, NotebookPen, RotateCcw } from "lucide-react";
import { formatMinutes, SLOT_LABEL } from "../lib/format";
import { toast } from "./toast";
import { Badge, cx, SubjectDot } from "./ui";

/** Anki search for the decks worth reviewing in this session. */
export function ankiSearch(decks: string[]): string {
  const unique = [...new Set(decks)];
  if (unique.length === 0) return "is:due";
  const parts = unique.map((d) => `deck:"${d}*"`);
  return `${parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0]} is:due`;
}

export function sessionDecks(session: PlannedSession, subjects: Map<string, Subject>, focus: Subject[]): string[] {
  const names = session.items.map((i) => subjects.get(i.subjectId)?.name).filter(Boolean) as string[];
  if (session.reviewSubjectId) names.unshift(subjects.get(session.reviewSubjectId)?.name ?? "");
  for (const s of focus) names.push(s.name);
  return names.filter(Boolean).slice(0, 3);
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Anki search copied. Paste it into a Filtered Deck.", { tone: "success" });
  } catch {
    toast(text);
  }
}

export function SessionCard({
  session,
  subjects,
  focus,
  compact,
}: {
  session: PlannedSession;
  subjects: Map<string, Subject>;
  /** Subjects with an exam coming up: their decks are suggested too. */
  focus: Subject[];
  compact?: boolean;
}) {
  const total = session.ankiMinutes + session.items.reduce((a, i) => a + i.minutes, 0) + (session.reviewMinutes ?? 0);
  const search = ankiSearch(sessionDecks(session, subjects, focus));
  const reviewSubject = session.reviewSubjectId ? subjects.get(session.reviewSubjectId) : undefined;

  return (
    <div
      className={cx(
        "overflow-hidden rounded-2xl border bg-white dark:bg-slate-900",
        session.kind === "buffer" && "buffer-stripes border-amber-300/70 dark:border-amber-500/40",
        session.kind === "extra" && "border-rose-200 dark:border-rose-500/30",
        session.kind === "normal" && "border-slate-200/80 dark:border-slate-800",
      )}
    >
      <div className="flex items-center justify-between gap-2 px-4 pt-3">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold">{SLOT_LABEL[session.slot]}</span>
          {session.kind === "buffer" && <Badge tone="amber">Buffer · catch-up</Badge>}
          {session.kind === "extra" && <Badge tone="rose">Extra session</Badge>}
          {session.type === "review" && <Badge tone="indigo">Exam review</Badge>}
        </div>
        <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{formatMinutes(total)}</span>
      </div>

      <ul className="space-y-1 px-2 py-2">
        <li className="flex items-center gap-3 rounded-xl px-2 py-1.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
            <Layers size={16} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">Anki review</p>
            {!compact && <p className="truncate font-mono text-xs text-slate-500 dark:text-slate-400">{search}</p>}
          </div>
          <span className="text-xs text-slate-500 tabular-nums">{formatMinutes(session.ankiMinutes)}</span>
          {!compact && (
            <button onClick={() => copy(search)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Copy Anki search">
              <Copy size={15} />
            </button>
          )}
        </li>

        {reviewSubject && (
          <li className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <RotateCcw size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Review {reviewSubject.name}</p>
              {!compact && <p className="text-xs text-slate-500 dark:text-slate-400">Whole Anki deck + skim your summaries</p>}
            </div>
            <span className="text-xs text-slate-500 tabular-nums">{formatMinutes(session.reviewMinutes ?? 0)}</span>
          </li>
        )}

        {session.items.map((item) => {
          const subject = subjects.get(item.subjectId);
          return (
            <li key={`${item.chunkId}-${item.part}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
              <span
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
                style={{ background: `${subject?.color ?? "#94a3b8"}1f`, color: subject?.color }}
              >
                <BookOpen size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.title}</p>
                <p className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                  <SubjectDot color={subject?.color} className="h-1.5 w-1.5" />
                  {subject?.name}
                  {!compact && (
                    <span className="ml-1 inline-flex items-center gap-1 text-slate-400">
                      <BookOpen size={11} /> <NotebookPen size={11} /> <Brain size={11} /> ~{item.cards} cards
                    </span>
                  )}
                </p>
              </div>
              <span className="text-xs text-slate-500 tabular-nums">{formatMinutes(item.minutes)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
