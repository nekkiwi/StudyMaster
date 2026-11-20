import { sessionMinutes, type ItemKind, type PlannedSession, type PlanItem, type Subject } from "@studymaster/core";
import { BookOpen, Copy, Files, Layers, PenLine, Presentation, RotateCcw, Video } from "lucide-react";
import { formatMinutes, SLOT_LABEL } from "../lib/format";
import { toast } from "./toast";
import { Badge, cx, SubjectDot } from "./ui";

export const KIND_ICON: Record<ItemKind, typeof BookOpen> = {
  chapter: BookOpen,
  slides: Presentation,
  mixed: Files,
  recording: Video,
  anki: Layers,
};

export const KIND_LABEL: Record<ItemKind, string> = {
  chapter: "Chapter",
  slides: "Slide deck",
  mixed: "Chapter + slides",
  recording: "Recording",
  anki: "Anki",
};

/** Anki search for these decks: due cards, plus new ones after writing cards. */
export function ankiSearch(deckNames: string[], withNew = false): string {
  const unique = [...new Set(deckNames)].filter(Boolean);
  const which = withNew ? "(is:due OR is:new)" : "is:due";
  if (unique.length === 0) return which;
  const parts = unique.map((d) => `deck:"${d}*"`);
  return `${parts.length > 1 ? `(${parts.join(" OR ")})` : parts[0]} ${which}`;
}

export function deckNames(item: PlanItem, subjects: Map<string, Subject>): string[] {
  return (item.decks ?? []).map((id) => subjects.get(id)?.name ?? "").filter(Boolean);
}

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast("Anki search copied. Paste it into a Filtered Deck.", { tone: "success" });
  } catch {
    toast(text);
  }
}

const SESSION_BADGE: Record<PlannedSession["type"], { label: string; tone: "indigo" | "slate" } | null> = {
  study: null,
  review: { label: "Exam review", tone: "indigo" },
  anki: { label: "Anki only", tone: "slate" },
};

export function SessionCard({
  session,
  subjects,
  compact,
}: {
  session: PlannedSession;
  subjects: Map<string, Subject>;
  compact?: boolean;
}) {
  const reviewSubject = session.reviewSubjectId ? subjects.get(session.reviewSubjectId) : undefined;
  const badge = SESSION_BADGE[session.type];

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
          {badge && <Badge tone={badge.tone}>{badge.label}</Badge>}
        </div>
        <span className="text-xs text-slate-500 tabular-nums dark:text-slate-400">{formatMinutes(sessionMinutes(session))}</span>
      </div>

      <ul className="space-y-1 px-2 py-2">
        {session.items.map((item) =>
          item.kind === "anki" ? (
            <AnkiRow key={item.chunkId} item={item} subjects={subjects} compact={compact} />
          ) : (
            <ChunkRow key={`${item.chunkId}-${item.part}`} item={item} subject={subjects.get(item.subjectId)} compact={compact} />
          ),
        )}

        {reviewSubject && (
          <li className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
              <RotateCcw size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">Review {reviewSubject.name}</p>
              {!compact && <p className="text-xs text-slate-500 dark:text-slate-400">Whole Anki deck + skim the slides and notes</p>}
            </div>
            <span className="text-xs text-slate-500 tabular-nums">{formatMinutes(session.reviewMinutes ?? 0)}</span>
          </li>
        )}
      </ul>
    </div>
  );
}

function AnkiRow({ item, subjects, compact }: { item: PlanItem; subjects: Map<string, Subject>; compact?: boolean }) {
  const names = deckNames(item, subjects);
  const newCards = item.anki?.newCards ?? 0;
  const search = ankiSearch(names, newCards > 0);
  const what =
    newCards > 0
      ? `Learn ~${newCards} new cards + review ${names.join(", ")}`
      : `Review ${names.join(", ") || "due cards"}`;
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-1.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
        <Layers size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Anki</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{what}</p>
        {!compact && <p className="truncate font-mono text-[11px] text-slate-400">{search}</p>}
      </div>
      <span className="text-xs text-slate-500 tabular-nums">{formatMinutes(item.minutes)}</span>
      {!compact && (
        <button onClick={() => copy(search)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800" aria-label="Copy Anki search">
          <Copy size={15} />
        </button>
      )}
    </li>
  );
}

/** "🎬 60 min · 📖 12 pages · ✍️ ~14 cards" for one piece of a lecture. */
export function StepChips({ item }: { item: PlanItem }) {
  const chips: { icon: typeof Video; text: string }[] = [];
  if (item.steps.watch > 0) chips.push({ icon: Video, text: formatMinutes(item.steps.watch) });
  if (item.steps.read > 0) {
    const what = [item.pages > 0 && `${item.pages} pages`, item.slides > 0 && `${item.slides} slides`].filter(Boolean).join(" + ");
    chips.push({ icon: BookOpen, text: what || formatMinutes(item.steps.read) });
  }
  if (item.steps.cards > 0) chips.push({ icon: PenLine, text: `~${item.cards} cards` });
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {chips.map(({ icon: Icon, text }) => (
        <span key={text} className="inline-flex items-center gap-1 whitespace-nowrap">
          <Icon size={11} /> {text}
        </span>
      ))}
    </span>
  );
}

function ChunkRow({ item, subject, compact }: { item: PlanItem; subject?: Subject; compact?: boolean }) {
  const Icon = KIND_ICON[item.kind];
  return (
    <li className="flex items-center gap-3 rounded-xl px-2 py-1.5">
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg"
        style={{ background: `${subject?.color ?? "#94a3b8"}1f`, color: subject?.color }}
        title={KIND_LABEL[item.kind]}
      >
        <Icon size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{item.title}</p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 dark:text-slate-400">
          <span className="inline-flex items-center gap-1.5">
            <SubjectDot color={subject?.color} className="h-1.5 w-1.5" />
            {subject?.name}
          </span>
          {!compact && (
            <span className="text-slate-400">
              <StepChips item={item} />
            </span>
          )}
        </p>
      </div>
      <span className="text-xs text-slate-500 tabular-nums">{formatMinutes(item.minutes)}</span>
    </li>
  );
}
