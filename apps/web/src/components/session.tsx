import { sessionMinutes, type Chunk, type ItemKind, type PlannedSession, type PlanItem, type StepKey, type Subject } from "@studymaster/core";
import { BookOpen, Files, Layers, PenLine, Play, Presentation, RotateCcw, Video } from "lucide-react";
import { useMemo } from "react";
import { deckForChunk, deckForSubject } from "../lib/anki";
import { formatMinutes, SLOT_LABEL } from "../lib/format";
import { useStore } from "../store";
import { useOpenAnki } from "./ankiConnect";
import { stepsInOrder } from "./steps";
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

/**
 * The Anki decks behind an Anki task. After writing cards: the linked deck of
 * each lecture/chapter from this session ("Biology::VL03 Genetics"). Reviews
 * only: the subject's deck. Each target opens exactly that deck.
 */
export function decksToOpen(
  item: PlanItem,
  subjects: Map<string, Subject>,
  chunks: Map<string, Pick<Chunk, "title" | "ankiDeck">>,
): { label: string; deck: string }[] {
  const out: { label: string; deck: string }[] = [];
  for (const l of item.anki?.lectures ?? []) {
    const subject = subjects.get(l.subjectId);
    if (!subject) continue;
    const chunk = chunks.get(l.chunkId) ?? { title: l.title };
    out.push({ label: chunk.title, deck: deckForChunk(chunk, subject) });
  }
  if (out.length === 0) {
    for (const id of item.decks ?? []) {
      const subject = subjects.get(id);
      if (subject) out.push({ label: subject.name, deck: deckForSubject(subject) });
    }
  }
  return out.filter((x, i) => out.findIndex((y) => y.deck === x.deck) === i);
}

export function deckNames(item: PlanItem, subjects: Map<string, Subject>): string[] {
  return (item.decks ?? []).map((id) => subjects.get(id)?.name ?? "").filter(Boolean);
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
            <AnkiRow key={item.chunkId} item={item} date={session.date} subjects={subjects} compact={compact} />
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

function AnkiRow({ item, date, subjects, compact }: { item: PlanItem; date: string; subjects: Map<string, Subject>; compact?: boolean }) {
  const allChunks = useStore((s) => s.chunks);
  const ankiDue = useStore((s) => s.ankiDue);
  const chunks = useMemo(() => new Map(allChunks.map((c) => [c.id, c])), [allChunks]);
  const names = deckNames(item, subjects);
  const newCards = item.anki?.newCards ?? 0;
  const openAnki = useOpenAnki();
  const targets = decksToOpen(item, subjects, chunks);
  // Real due counts from Anki, when known for this day (shared over the day's sessions).
  const parts = (item.decks ?? [])
    .map((id) => {
      const name = subjects.get(id)?.name;
      const due = ankiDue?.[id]?.[date];
      return name ? (due !== undefined ? `${name} (${due} due)` : name) : "";
    })
    .filter(Boolean);
  const review = parts.join(", ") || "due cards";
  const what = newCards > 0 ? `Learn ~${newCards} new cards + review ${review}` : `Review ${review}`;
  const button = "inline-flex max-w-40 items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-sky-500";
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-xl px-2 py-1.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sky-50 text-sky-600 dark:bg-sky-500/10 dark:text-sky-400">
        <Layers size={16} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">Anki</p>
        <p className="truncate text-xs text-slate-500 dark:text-slate-400">{what}</p>
      </div>
      <span className="text-xs text-slate-500 tabular-nums">{formatMinutes(item.minutes)}</span>
      {!compact &&
        (targets.length <= 1 ? (
          <button
            onClick={() => openAnki(targets[0]?.deck ?? "")}
            className={button}
            aria-label={targets[0] ? `Open ${targets[0].deck} in Anki` : "Open Anki"}
            title={targets[0] ? `Opens “${targets[0].deck}” in Anki` : "Opens Anki"}
          >
            <Play size={13} /> Anki
          </button>
        ) : (
          <div className="flex basis-full flex-wrap justify-end gap-1.5 pl-11">
            {targets.map((t) => (
              <button key={t.deck} onClick={() => openAnki(t.deck)} className={button} aria-label={`Open ${t.deck} in Anki`} title={`Opens “${t.deck}” in Anki`}>
                <Play size={13} className="shrink-0" /> <span className="truncate">{t.label}</span>
              </button>
            ))}
          </div>
        ))}
    </li>
  );
}

/** "🎬 60 min · 📖 12 pages · 📝 summary 40 min · ✍️ ~14 cards" for one piece, in the study style's order. */
export function StepChips({ item }: { item: PlanItem }) {
  const workflow = useStore((s) => s.settings.workflow);
  const text = (key: StepKey): string => {
    if (key === "read") {
      const what = [item.pages > 0 && `${item.pages} pages`, item.slides > 0 && `${item.slides} slides`].filter(Boolean).join(" + ");
      return what || formatMinutes(item.steps.read);
    }
    if (key === "cards") return `~${item.cards} cards`;
    if (key === "summary") return `summary ${formatMinutes(item.steps.summary)}`;
    if (key === "revise") return `study summary ${formatMinutes(item.steps.revise)}`;
    return formatMinutes(item.steps[key]);
  };
  const chips = stepsInOrder(workflow).filter(({ key }) => item.steps[key] > 0);
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-0.5">
      {chips.map(({ key, icon: Icon }) => (
        <span key={key} className="inline-flex items-center gap-1 whitespace-nowrap">
          <Icon size={11} /> {text(key)}
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
