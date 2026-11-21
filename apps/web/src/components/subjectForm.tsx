import {
  chunkKind,
  estimatedCards,
  remainingMinutes,
  totalMinutes,
  WEIGHTS,
  type Chunk,
  type Subject,
  type Weight,
} from "@studymaster/core";
import { ArrowDown, ArrowUp, Layers, Link2, ListTree, PenLine, Plus, Trash2, Upload } from "lucide-react";
import { useState } from "react";
import { deckForChunk } from "../lib/anki";
import { parseBulk } from "../lib/bulk";
import { SUBJECT_COLORS } from "../lib/colors";
import { formatMinutes, newId } from "../lib/format";
import { useStore } from "../store";
import { canTalkToAnki, createMissingDecks } from "./ankiConnect";
import { ImportDialog } from "./importer";
import { KIND_ICON, KIND_LABEL } from "./session";
import { toast } from "./toast";
import { stepsInOrder } from "./steps";
import { Button, Field, NameInput, NumberInput, Segmented, TextArea, TextInput, cx } from "./ui";

export const WEIGHT_LABEL: Record<Weight, string> = {
  0.5: "very easy",
  0.8: "easy",
  1: "normal",
  1.2: "hard",
  1.5: "very hard",
};

export function SubjectFields({ subject, onChange, autoFocus }: { subject: Subject; onChange: (s: Subject) => void; autoFocus?: boolean }) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <NameInput label="Subject name" value={subject.name} placeholder="e.g. Biology" autoFocus={autoFocus} onChange={(name) => onChange({ ...subject, name })} />
        <Field label="Color" group>
          <div className="flex h-10 items-center gap-1.5">
            {SUBJECT_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Color ${c}`}
                onClick={() => onChange({ ...subject, color: c })}
                className={cx("h-7 w-7 rounded-full transition", subject.color === c ? "ring-2 ring-offset-2 ring-slate-400 dark:ring-offset-slate-900" : "hover:scale-110")}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
      </div>
      <Field label="How hard is it for you?" hint="Harder subjects get more time per page." group>
        <Segmented
          value={subject.weight}
          onChange={(w) => onChange({ ...subject, weight: w })}
          options={WEIGHTS.map((w) => ({
            value: w,
            label: (
              <span className="flex flex-col leading-tight">
                <span>{w.toFixed(1)}</span>
                <span className="text-[10px] font-normal opacity-70">{WEIGHT_LABEL[w]}</span>
              </span>
            ),
          }))}
        />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Exam date">
          <TextInput type="date" value={subject.examDate} onChange={(e) => e.target.value && onChange({ ...subject, examDate: e.target.value })} />
        </Field>
        <Field label="Exam time" group>
          <Segmented
            value={subject.examHalf ?? "am"}
            onChange={(h) => onChange({ ...subject, examHalf: h })}
            options={[
              { value: "am", label: "Morning" },
              { value: "pm", label: "Afternoon" },
            ]}
          />
        </Field>
      </div>
    </div>
  );
}

export function ChunkList({ subject, hideAdd }: { subject: Subject; hideAdd?: boolean }) {
  const allChunks = useStore((s) => s.chunks);
  const settings = useStore((s) => s.settings);
  const upsertChunk = useStore((s) => s.upsertChunk);
  const removeChunk = useStore((s) => s.removeChunk);
  const moveChunk = useStore((s) => s.moveChunk);
  const chunks = allChunks.filter((c) => c.subjectId === subject.id).sort((a, b) => a.order - b.order);

  const total = chunks.reduce((a, c) => a + totalMinutes(c, subject, settings), 0);

  return (
    <div>
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium whitespace-nowrap">{chunks.length} item{chunks.length === 1 ? "" : "s"}</span>
        <span className="text-slate-500">≈ {formatMinutes(total)} to watch, read and write cards</span>
      </div>
      {chunks.length === 0 && (
        <p className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-sm text-slate-500 dark:border-slate-700">
          No material yet. Add lectures, chapters or slide decks below.
        </p>
      )}
      <ul className="space-y-2">
        {chunks.map((chunk, index) => (
          <ChunkRow
            key={chunk.id}
            chunk={chunk}
            minutes={totalMinutes(chunk, subject, settings)}
            left={remainingMinutes(chunk, subject, settings)}
            cards={estimatedCards(chunk, settings)}
            deck={deckForChunk(chunk, subject)}
            first={index === 0}
            last={index === chunks.length - 1}
            onChange={upsertChunk}
            onRemove={() => removeChunk(chunk.id)}
            onMove={(d) => moveChunk(chunk.id, d)}
          />
        ))}
      </ul>
      {!hideAdd && <AddChunks subject={subject} nextOrder={(chunks[chunks.length - 1]?.order ?? 0) + 1} />}
    </div>
  );
}

function ChunkRow({
  chunk,
  minutes,
  left,
  cards,
  deck,
  first,
  last,
  onChange,
  onRemove,
  onMove,
}: {
  chunk: Chunk;
  minutes: number;
  left: number;
  cards: number;
  deck: string;
  first: boolean;
  last: boolean;
  onChange: (c: Chunk) => void;
  onRemove: () => void;
  onMove: (d: -1 | 1) => void;
}) {
  const done = left < 0.5;
  const workflow = useStore((s) => s.settings.workflow);
  const kind = chunkKind(chunk);
  const KindIcon = KIND_ICON[kind];
  return (
    <li className={cx("rounded-2xl border border-slate-200 p-3 dark:border-slate-800", done && "bg-emerald-50/50 dark:bg-emerald-500/5")}>
      <div className="flex flex-wrap items-center gap-2">
        <span title={KIND_LABEL[kind]} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          <KindIcon size={16} />
        </span>
        <TextInput className="min-w-0 flex-1" value={chunk.title} aria-label="Title" onChange={(e) => onChange({ ...chunk, title: e.target.value })} />
      </div>
      <div className={cx("mt-2 grid gap-2", workflow.includes("watch") ? "grid-cols-3" : "grid-cols-2")}>
        {(
          [
            ["Video (min)", chunk.recordingMinutes ?? 0, (v: number) => onChange({ ...chunk, recordingMinutes: v })],
            ["Pages", chunk.pages, (v: number) => onChange({ ...chunk, pages: v })],
            ["Slides", chunk.slides, (v: number) => onChange({ ...chunk, slides: v })],
          ] as const
        )
          // Video length only matters when watching lectures is part of the study style.
          .filter(([label]) => label !== "Video (min)" || workflow.includes("watch"))
          .map(([label, value, set]) => (
          <label key={label} className="block">
            <span className="mb-0.5 block text-[11px] text-slate-500">{label}</span>
            <NumberInput aria-label={label} min={0} value={value} onChange={(v) => set(Math.max(0, Math.round(v)))} />
          </label>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {stepsInOrder(workflow).filter(({ key }) => key !== "watch" || (chunk.recordingMinutes ?? 0) > 0).map(({ key, icon: Icon, label }) => {
          const value = chunk.done?.[key] ?? 0;
          const on = value >= 0.999;
          return (
            <button
              key={key}
              type="button"
              aria-pressed={on}
              title={`${label}: ${Math.round(value * 100)}% done`}
              onClick={() => onChange({ ...chunk, done: { ...chunk.done, [key]: on ? 0 : 1 } })}
              className={cx(
                "inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium transition",
                on
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : value > 0
                    ? "border-emerald-300 text-emerald-700 dark:text-emerald-300"
                    : "border-slate-200 text-slate-500 dark:border-slate-700",
              )}
            >
              <Icon size={13} /> {label}
              {value > 0 && !on && <span className="tabular-nums">{Math.round(value * 100)}%</span>}
            </button>
          );
        })}
        <label className="inline-flex items-center gap-1.5 text-xs text-slate-500" title="Anki cards written for this item">
          <Layers size={13} />
          <span className="inline-block w-16">
          <NumberInput
            className="h-7 px-2 py-0 text-xs"
            aria-label="Anki cards made"
            min={0}
            value={chunk.cards ?? cards}
            onChange={(v) => onChange({ ...chunk, cards: Math.max(0, Math.round(v)) })}
          />
          </span>
          cards
          {chunk.ankiCards !== undefined && <span className="text-sky-600 dark:text-sky-400">· {chunk.ankiCards} in Anki</span>}
        </label>
        <span className="text-xs text-slate-400">{done ? "done" : `${formatMinutes(left)} left of ${formatMinutes(minutes)}`}</span>
        <span className="ml-auto flex items-center gap-0.5">
          <span
            className={cx("mr-2 hidden items-center gap-1 font-mono text-[10px] sm:inline-flex", chunk.ankiDeck ? "text-sky-600 dark:text-sky-400" : "text-slate-400")}
            title={chunk.ankiDeck ? "Linked Anki deck – ▶ Anki opens it" : "Anki deck name (not linked yet)"}
          >
            {chunk.ankiDeck && <Link2 size={11} />} {deck}
          </span>
          <button type="button" disabled={first} onClick={() => onMove(-1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" aria-label="Move up">
            <ArrowUp size={15} />
          </button>
          <button type="button" disabled={last} onClick={() => onMove(1)} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800" aria-label="Move down">
            <ArrowDown size={15} />
          </button>
          <button type="button" onClick={onRemove} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Delete">
            <Trash2 size={15} />
          </button>
        </span>
      </div>
    </li>
  );
}

/** New lectures in a subject linked to Anki get their own sub-deck there (when Anki is reachable). */
function deckForNew(subject: Subject, chunkIds: string[]) {
  if (!subject.ankiDeck || !canTalkToAnki()) return;
  createMissingDecks({ chunkIds })
    .then((n) => n && toast(`Created ${n} sub-deck${n === 1 ? "" : "s"} in Anki.`, { tone: "success" }))
    .catch(() => toast("Couldn't create the sub-deck in Anki – is Anki open? You can create it later in the Anki deck section."));
}

export function AddChunks({ subject, nextOrder }: { subject: Subject; nextOrder: number }) {
  const addChunks = useStore((s) => s.addChunks);
  const watching = useStore((s) => s.settings.workflow.includes("watch"));
  // Without watching lectures in the study style, new items get no video length.
  const defaultRecording = useStore((s) => (watching ? s.settings.defaultRecordingMinutes : 0));
  const [mode, setMode] = useState<"one" | "many">("one");
  const [title, setTitle] = useState("");
  const [recording, setRecording] = useState(defaultRecording);
  const [pages, setPages] = useState(0);
  const [slides, setSlides] = useState(0);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<"pages" | "slides">("pages");
  const parsed = parseBulk(text, kind);

  const canAddOne = !!title.trim() && (pages > 0 || slides > 0 || recording > 0);
  const addOne = () => {
    if (!canAddOne) return;
    const id = newId();
    addChunks([{ id, subjectId: subject.id, title: title.trim(), recordingMinutes: recording, pages, slides, order: nextOrder }]);
    deckForNew(subject, [id]);
    setTitle("");
    setPages(0);
    setSlides(0);
  };

  // Lines without a recording length get the "recording per lecture" value.
  const addMany = () => {
    const added = parsed.chunks.map((c, i) => ({
      id: newId(),
      subjectId: subject.id,
      ...c,
      recordingMinutes: c.recordingMinutes ?? recording,
      order: nextOrder + i,
    }));
    addChunks(added);
    deckForNew(subject, added.map((c) => c.id));
    setText("");
  };

  return (
    <div className="mt-4 rounded-2xl bg-slate-50 p-3 dark:bg-slate-800/40">
      <Segmented
        className="mb-3"
        value={mode}
        onChange={setMode}
        options={[
          { value: "one", label: "Add one" },
          { value: "many", label: "Add many at once" },
        ]}
      />
      {mode === "one" ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            addOne();
          }}
        >
          <div className="min-w-40 flex-1">
            <Field label="Name">
              <TextInput value={title} placeholder="Lecture 7 / Ch 4" onChange={(e) => setTitle(e.target.value)} />
            </Field>
          </div>
          {watching && (
            <div className="w-24">
              <Field label="Video (min)">
                <NumberInput min={0} value={recording} onChange={setRecording} />
              </Field>
            </div>
          )}
          <div className="w-24">
            <Field label="Pages">
              <NumberInput min={0} value={pages} onChange={setPages} />
            </Field>
          </div>
          <div className="w-24">
            <Field label="Slides">
              <NumberInput min={0} value={slides} onChange={setSlides} />
            </Field>
          </div>
          <Button type="submit" disabled={!canAddOne}>
            <Plus size={16} /> Add
          </Button>
        </form>
      ) : (
        <div className="space-y-2">
          <TextArea
            rows={5}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={"Lecture 1-4: 40, 35, 52, 44\nLecture 5: 45 slides 90min\nCh 6: 18p 30s"}
          />
          <label className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            Recording per lecture
            <span className="inline-block w-20">
              <NumberInput className="h-8 py-1" min={0} value={recording} onChange={setRecording} aria-label="Recording minutes per lecture" />
            </span>
            min (0 = none; a line can set its own, e.g. "90min")
          </label>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs text-slate-500">
              Plain numbers are
              <Segmented
                className="w-40"
                value={kind}
                onChange={setKind}
                options={[
                  { value: "pages", label: "pages" },
                  { value: "slides", label: "slides" },
                ]}
              />
            </div>
            <Button onClick={addMany} disabled={parsed.chunks.length === 0 || parsed.errors.length > 0}>
              <Plus size={16} /> Add {parsed.chunks.length || ""} chunk{parsed.chunks.length === 1 ? "" : "s"}
            </Button>
          </div>
          {parsed.errors.length > 0 && (
            <ul className="text-xs text-rose-600 dark:text-rose-400">
              {parsed.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

type AddWay = "files" | "toc" | "anki" | "hand";

const ADD_WAYS: { way: AddWay; icon: typeof Upload; title: string; text: string }[] = [
  { way: "files", icon: Upload, title: "Import files", text: "Slides, book PDFs, videos – chapters are found for you" },
  { way: "toc", icon: ListTree, title: "Paste a table of contents", text: "Copy it from the book or the course page" },
  { way: "anki", icon: Layers, title: "From your Anki deck", text: "Its sub-decks become the lectures" },
  { way: "hand", icon: PenLine, title: "Add by hand", text: "Type lectures, chapters or slide decks" },
];

/** The subject's material: the list, plus clear ways to add more. */
export function MaterialSection({ subject }: { subject: Subject }) {
  const chunks = useStore((s) => s.chunks).filter((c) => c.subjectId === subject.id);
  const [importing, setImporting] = useState<"files" | "toc" | "anki" | null>(null);
  const [byHand, setByHand] = useState(false);
  const nextOrder = Math.max(0, ...chunks.map((c) => c.order)) + 1;
  const choose = (way: AddWay) => (way === "hand" ? setByHand(true) : setImporting(way));
  const dialog = <ImportDialog open={!!importing} initialMode={importing ?? "files"} targetSubjectId={subject.id} onClose={() => setImporting(null)} />;

  if (chunks.length === 0 && !byHand) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">How do you want to add the material for {subject.name || "this subject"}?</p>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {ADD_WAYS.map(({ way, icon: Icon, title, text }) => (
            <button
              key={way}
              type="button"
              onClick={() => choose(way)}
              className="flex items-start gap-3 rounded-2xl border border-slate-200 p-4 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 dark:border-slate-700 dark:hover:bg-indigo-500/5"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-300">
                <Icon size={18} />
              </span>
              <span>
                <span className="block font-semibold">{title}</span>
                <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">{text}</span>
              </span>
            </button>
          ))}
        </div>
        {dialog}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ChunkList subject={subject} hideAdd />
      {byHand ? (
        <AddChunks subject={subject} nextOrder={nextOrder} />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="mr-1 text-sm text-slate-500">Add more:</span>
          {ADD_WAYS.map(({ way, icon: Icon, title }) => (
            <Button key={way} size="sm" variant="secondary" onClick={() => choose(way)}>
              <Icon size={14} /> {way === "toc" ? "Table of contents" : way === "anki" ? "From Anki" : title}
            </Button>
          ))}
        </div>
      )}
      {dialog}
    </div>
  );
}
