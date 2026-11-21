import { ArrowUpToLine, FileText, FolderOpen, Layers, Link2, ListTree, Loader2, Upload } from "lucide-react";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { filesFromDrop, filesFromInput, readFiles, type PickedFile } from "../lib/fileReaders";
import { todayISO } from "../lib/format";
import { leaf } from "../lib/anki";
import { adoptEmptySubject, ankiTarget, buildDraft, draftFromToc, mergeChunks, type Draft, type DraftChunk, type DraftSubject } from "../lib/importer";
import { useStore } from "../store";
import { AnkiCollectionPicker } from "./ankiConnect";
import { toast } from "./toast";
import { Badge, Button, cx, Field, Modal, NameInput, NumberInput, Segmented, Select, TextArea, TextInput } from "./ui";

type Mode = "files" | "toc" | "anki";
type Stage = { kind: "choose" } | { kind: "reading"; done: number; total: number; name: string } | { kind: "review"; draft: Draft };

/**
 * Import material: files, folders or a pasted table of contents are turned
 * into subjects and chunks, then shown for review before anything is added.
 */
export function ImportDialog({
  open,
  onClose,
  initialDraft,
  initialMode = "files",
  targetSubjectId,
}: {
  open: boolean;
  onClose: () => void;
  initialDraft?: Draft;
  initialMode?: Mode;
  /** Opened from a subject: what's found goes into that subject (when it's one subject). */
  targetSubjectId?: string;
}) {
  const subjects = useStore((s) => s.subjects);
  const defaultRecording = useStore((s) => s.settings.defaultRecordingMinutes);
  const target = subjects.find((s) => s.id === targetSubjectId);
  /** A draft with a single subject goes into the target subject. */
  const toTarget = (d: Draft): Draft => {
    const only = d.subjects.length === 1 ? d.subjects[0]! : undefined;
    if (!target || !only || only.existingId === target.id) return d;
    const next = only.ankiSubdecks
      ? ankiTarget(only, target, useStore.getState().chunks, defaultRecording)
      : { ...only, existingId: target.id, name: target.name };
    return { ...d, subjects: [next] };
  };
  const importDraft = useStore((s) => s.importDraft);
  const [stage, setStage] = useState<Stage>({ kind: "choose" });
  // A ready draft (e.g. from Anki decks) goes straight to the review.
  useEffect(() => {
    if (open && initialDraft) setStage({ kind: "review", draft: initialDraft });
  }, [open, initialDraft]);

  const close = () => {
    setStage({ kind: "choose" });
    onClose();
  };

  const read = async (picked: PickedFile[]) => {
    if (picked.length === 0) return;
    setStage({ kind: "reading", done: 0, total: picked.length, name: "" });
    const files = await readFiles(picked, (done, total, name) => setStage({ kind: "reading", done, total, name }));
    const chunks = useStore.getState().chunks;
    setStage({ kind: "review", draft: toTarget(adoptEmptySubject(buildDraft(files, subjects, todayISO()), subjects, chunks)) });
  };

  const draft = stage.kind === "review" ? stage.draft : undefined;
  const on = draft?.subjects.filter((s) => s.include) ?? [];
  const picked = on.flatMap((s) => s.chunks.filter((c) => c.include));
  const links = on.flatMap((s) => (s.links ?? []).filter((l) => l.include));
  const linksDeck = on.some((s) => s.ankiDeck);
  const applyLabel =
    picked.length > 0
      ? `Add ${picked.length} item${picked.length === 1 ? "" : "s"}${links.length ? ` · link ${links.length}` : ""}`
      : links.length > 0
        ? `Link ${links.length} item${links.length === 1 ? "" : "s"}`
        : "Link deck";

  const apply = () => {
    if (!draft) return;
    const result = importDraft(draft);
    const added = `Added ${result.chunks} item${result.chunks === 1 ? "" : "s"}${result.subjects ? ` and ${result.subjects} new subject${result.subjects === 1 ? "" : "s"}` : ""}`;
    toast(result.chunks || result.subjects ? `${added}.` : "Linked to Anki.", { tone: "success" });
    close();
  };

  return (
    <Modal
      open={open}
      onClose={close}
      title={stage.kind === "review" ? "Check what was found" : target ? `Import material for ${target.name}` : "Import material"}
      wide
      footer={
        stage.kind === "review" ? (
          <>
            <Button variant="ghost" onClick={() => setStage({ kind: "choose" })}>
              Back
            </Button>
            <Button onClick={apply} disabled={picked.length === 0 && links.length === 0 && !linksDeck}>
              {applyLabel}
            </Button>
          </>
        ) : undefined
      }
    >
      {stage.kind === "choose" && <Choose
          initialMode={initialMode}
          defaultSubject={target?.name}
          onFiles={read}
          onToc={(d) => setStage({ kind: "review", draft: toTarget(d) })}
        />}
      {stage.kind === "reading" && (
        <div className="flex flex-col items-center gap-3 py-12 text-center">
          <Loader2 className="animate-spin text-indigo-600" size={28} />
          <p className="font-medium">
            Reading {Math.min(stage.done + 1, stage.total)} of {stage.total}…
          </p>
          <p className="max-w-full truncate text-sm text-slate-500">{stage.name}</p>
          <p className="text-xs text-slate-400">Files stay on your device.</p>
        </div>
      )}
      {stage.kind === "review" && <Review draft={stage.draft} onChange={(d) => setStage({ kind: "review", draft: d })} />}
    </Modal>
  );
}

function Choose({
  initialMode,
  defaultSubject,
  onFiles,
  onToc,
}: {
  initialMode: Mode;
  defaultSubject?: string;
  onFiles: (files: PickedFile[]) => void;
  onToc: (draft: Draft) => void;
}) {
  const subjects = useStore((s) => s.subjects);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [dragging, setDragging] = useState(false);
  const files = useRef<HTMLInputElement>(null);
  const folder = useRef<HTMLInputElement>(null);
  const [tocText, setTocText] = useState("");
  const [tocSubject, setTocSubject] = useState(defaultSubject ?? subjects[0]?.name ?? "");
  const [lastPage, setLastPage] = useState(0);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setDragging(false);
    onFiles(await filesFromDrop(e.dataTransfer.items));
  };

  return (
    <div className="space-y-4">
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "files", label: "Files or folders" },
          { value: "toc", label: "Table of contents" },
          { value: "anki", label: "From Anki" },
        ]}
      />
      {mode === "anki" ? (
        <AnkiCollectionPicker onDraft={onToc} />
      ) : mode === "files" ? (
        <>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cx(
              "flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 text-center transition",
              dragging ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10" : "border-slate-300 dark:border-slate-700",
            )}
          >
            <Upload size={28} className="text-slate-400" />
            <div>
              <p className="font-medium">Drop lecture slides, book PDFs, PowerPoints or videos</p>
              <p className="mt-1 text-sm text-slate-500">
                A folder per subject works best, e.g. <span className="font-mono text-xs">Biology/Lecture 3.pdf</span>
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <Button variant="secondary" onClick={() => files.current?.click()}>
                <FileText size={16} /> Choose files
              </Button>
              <Button variant="secondary" onClick={() => folder.current?.click()}>
                <FolderOpen size={16} /> Choose a folder
              </Button>
            </div>
          </div>
          <input
            ref={files}
            type="file"
            multiple
            accept=".pdf,.pptx,video/*"
            className="hidden"
            onChange={(e) => e.target.files && onFiles(filesFromInput(e.target.files))}
          />
          <input
            ref={folder}
            type="file"
            multiple
            className="hidden"
            {...({ webkitdirectory: "", directory: "" } as Record<string, string>)}
            onChange={(e) => e.target.files && onFiles(filesFromInput(e.target.files))}
          />
          <ul className="space-y-1 text-sm text-slate-600 dark:text-slate-400">
            <li>📚 Book PDFs with bookmarks → one item per chapter, with page counts</li>
            <li>🖥️ Slide PDFs and PowerPoints → one lecture each, with the slide count</li>
            <li>🎬 Videos → recording length; matched to slides with the same lecture number</li>
            <li>🔒 Everything is read on your device – nothing is uploaded</li>
          </ul>
        </>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
            <Field label="Subject">
              <TextInput list="import-subjects" value={tocSubject} placeholder="e.g. Biology" onChange={(e) => setTocSubject(e.target.value)} />
              <datalist id="import-subjects">
                {subjects.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </Field>
            <Field label="Last page (optional)">
              <NumberInput min={0} value={lastPage} onChange={setLastPage} />
            </Field>
          </div>
          <Field label="Table of contents" hint="Copy it from the book or PDF. One line per chapter, ending with its first page.">
            <TextArea
              rows={8}
              value={tocText}
              onChange={(e) => setTocText(e.target.value)}
              placeholder={"1 Introduction ........ 1\n2 Cells .............. 12\n2.1 Membranes ........ 15\n3 Genetics ........... 40"}
            />
          </Field>
          <Button
            disabled={!tocText.trim()}
            onClick={() => {
              const draft = adoptEmptySubject(
                draftFromToc(tocText, tocSubject, subjects, todayISO(), lastPage || undefined),
                subjects,
                useStore.getState().chunks,
              );
              if (draft.subjects.length === 0) toast("No chapters found. Each line needs a page number at the end.");
              else onToc(draft);
            }}
          >
            <ListTree size={16} /> Find chapters
          </Button>
        </div>
      )}
    </div>
  );
}

function Review({ draft, onChange }: { draft: Draft; onChange: (d: Draft) => void }) {
  const existing = useStore((s) => s.subjects);
  const existingChunks = useStore((s) => s.chunks);
  const defaultRecording = useStore((s) => s.settings.defaultRecordingMinutes);
  const total = draft.subjects.reduce((a, s) => a + s.chunks.length, 0);

  const setSubject = (id: string, patch: Partial<DraftSubject>) =>
    onChange({ ...draft, subjects: draft.subjects.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const setChunk = (sid: string, cid: string, patch: Partial<DraftChunk>) =>
    onChange({
      ...draft,
      subjects: draft.subjects.map((s) =>
        s.id === sid ? { ...s, chunks: s.chunks.map((c) => (c.id === cid ? { ...c, ...patch } : c)) } : s,
      ),
    });
  const mergeUp = (sid: string, index: number) =>
    onChange({
      ...draft,
      subjects: draft.subjects.map((s) => {
        if (s.id !== sid || index < 1) return s;
        const chunks = s.chunks.slice();
        chunks.splice(index - 1, 2, mergeChunks(chunks[index - 1]!, chunks[index]!));
        return { ...s, chunks };
      }),
    });
  const moveTo = (sid: string, cid: string, target: string) => {
    const chunk = draft.subjects.find((s) => s.id === sid)?.chunks.find((c) => c.id === cid);
    if (!chunk || target === sid) return;
    onChange({
      ...draft,
      subjects: draft.subjects.map((s) =>
        s.id === sid
          ? { ...s, chunks: s.chunks.filter((c) => c.id !== cid) }
          : s.id === target
            ? { ...s, chunks: [...s.chunks, chunk] }
            : s,
      ),
    });
  };

  if (draft.subjects.length === 0 || (total === 0 && !draft.subjects.some((s) => s.ankiDeck))) {
    return <p className="py-8 text-center text-slate-500">Nothing to import was found.</p>;
  }

  return (
    <div className="space-y-5">
      {draft.subjects.some((s) => s.ankiDeck) ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Sub-decks with a name like one of your lectures or chapters are linked to it; the others become new items. Untick what you don't want, or
          choose another subject. Nothing changes until you confirm.
        </p>
      ) : (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Found {total} item{total === 1 ? "" : "s"} in {draft.subjects.length} subject{draft.subjects.length === 1 ? "" : "s"}. Untick what you don't
          need, fix names and numbers, or merge items (e.g. a recording and its slides). Nothing is added until you confirm.
        </p>
      )}

      {draft.subjects.map((subject) => {
        const on = subject.chunks.filter((c) => c.include).length;
        return (
          <section key={subject.id} className={cx("rounded-2xl border border-slate-200 dark:border-slate-800", !subject.include && "opacity-50")}>
            <header className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-3 dark:border-slate-800">
              <input
                type="checkbox"
                aria-label={`Import ${subject.name}`}
                checked={subject.include}
                onChange={(e) => setSubject(subject.id, { include: e.target.checked })}
                className="h-4 w-4 accent-indigo-600"
              />
              <div className="min-w-0 flex-1 basis-full sm:basis-auto">
                <NameInput label="Subject name" value={subject.name} onChange={(name) => setSubject(subject.id, { name })} />
              </div>
              <Select
                className="w-full sm:w-52"
                value={subject.existingId ?? ""}
                onChange={(v) => {
                  const target = existing.find((x) => x.id === v);
                  // Anki decks: re-match the sub-decks against the new target's items.
                  if (subject.ankiSubdecks) {
                    const next = ankiTarget(subject, target, existingChunks, defaultRecording);
                    setSubject(subject.id, target ? next : { ...next, name: subject.ankiDeck ?? subject.name });
                  } else setSubject(subject.id, { existingId: v || undefined, ...(target ? { name: target.name } : {}) });
                }}
                options={[{ value: "", label: "New subject" }, ...existing.map((x) => ({ value: x.id, label: `Add to ${x.name}` }))]}
              />
              {!subject.existingId && (
                <label className="flex items-center gap-1.5 text-xs text-slate-500">
                  Exam
                  <TextInput type="date" className="w-auto py-1.5" value={subject.examDate} onChange={(e) => e.target.value && setSubject(subject.id, { examDate: e.target.value })} />
                </label>
              )}
              {subject.chunks.length > 0 && (
                <span className="text-xs text-slate-500">
                  {on}/{subject.chunks.length} selected
                </span>
              )}
              {subject.ankiDeck && (
                <span className="flex basis-full items-center gap-1.5 text-xs text-slate-500">
                  <Layers size={13} /> Anki deck <span className="font-mono">{subject.ankiDeck}</span>
                </span>
              )}
            </header>
            {(subject.links?.length ?? 0) > 0 && (
              <div className="border-b border-slate-100 p-3 dark:border-slate-800">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  <Link2 size={13} /> Already in {subject.name} – linked by similar name
                </p>
                <ul className="space-y-1.5">
                  {subject.links!.map((l) => (
                    <li key={l.chunkId}>
                      <label className={cx("flex items-center gap-2 text-sm", !l.include && "opacity-50")}>
                        <input
                          type="checkbox"
                          checked={l.include}
                          onChange={(e) =>
                            setSubject(subject.id, { links: subject.links!.map((x) => (x.chunkId === l.chunkId ? { ...x, include: e.target.checked } : x)) })
                          }
                          className="h-4 w-4 shrink-0 accent-indigo-600"
                        />
                        <span className="min-w-0 truncate">{l.title}</span>
                        <span className="text-slate-400">↔</span>
                        <span className="min-w-0 truncate font-mono text-xs text-slate-500">{leaf(l.deck)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {subject.chunks.map((chunk, i) => (
                <li key={chunk.id} className={cx("space-y-2 p-3", !chunk.include && "opacity-50")}>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      aria-label={`Import ${chunk.title}`}
                      checked={chunk.include}
                      onChange={(e) => setChunk(subject.id, chunk.id, { include: e.target.checked })}
                      className="h-4 w-4 shrink-0 accent-indigo-600"
                    />
                    <TextInput className="min-w-0 flex-1" aria-label="Title" value={chunk.title} onChange={(e) => setChunk(subject.id, chunk.id, { title: e.target.value })} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 pl-6">
                    {(
                      [
                        ["Video (min)", "recordingMinutes"],
                        ["Pages", "pages"],
                        ["Slides", "slides"],
                      ] as const
                    ).map(([label, key]) => (
                      <label key={key} className="block">
                        <span className="mb-0.5 block text-[11px] text-slate-500">{label}</span>
                        <NumberInput aria-label={label} min={0} value={chunk[key]} onChange={(v) => setChunk(subject.id, chunk.id, { [key]: Math.max(0, Math.round(v)) })} />
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-6 text-xs text-slate-500">
                    <span className="min-w-0 basis-full truncate sm:flex-1 sm:basis-auto">{chunk.sources.join(" + ")}</span>
                    {chunk.note && <Badge tone="amber">{chunk.note}</Badge>}
                    <span className="ml-auto flex shrink-0 items-center gap-2">
                      {i > 0 && (
                        <button
                          type="button"
                          onClick={() => mergeUp(subject.id, i)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-2 py-1 font-medium text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                          <ArrowUpToLine size={13} /> Merge with above
                        </button>
                      )}
                      {draft.subjects.length > 1 && (
                        <Select
                          className="w-36 px-2 py-1 text-xs"
                          value={subject.id}
                          onChange={(v) => moveTo(subject.id, chunk.id, v)}
                          options={draft.subjects.map((s) => ({ value: s.id, label: s.id === subject.id ? "Move to…" : s.name }))}
                        />
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {draft.skipped.length > 0 && (
        <details className="text-sm text-slate-500">
          <summary className="cursor-pointer">
            {draft.skipped.length} file{draft.skipped.length === 1 ? "" : "s"} skipped
          </summary>
          <ul className="mt-2 space-y-0.5">
            {draft.skipped.map((s) => (
              <li key={s.name}>
                {s.name}: {s.reason}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
