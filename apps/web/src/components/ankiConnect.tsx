import type { Subject } from "@studymaster/core";
import { CheckCircle2, Download, ExternalLink, FolderPlus, Layers, Link2, Loader2, Plus, RefreshCw, Unplug, Wand2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  ANKIWEB_DECKS_URL,
  AnkiConnectError,
  ankiDeckNames,
  collections,
  createAnkiDecks,
  deckForChunk,
  deckForSubject,
  detectPlatform,
  leaf,
  matchDecks,
  openDeckOnDesktop,
  phoneAnkiLink,
  requestAnkiPermission,
  subdecks,
} from "../lib/anki";
import { useDevice } from "../lib/device";
import { newId, todayISO } from "../lib/format";
import { draftFromAnki, lectureNumber, type Draft } from "../lib/importer";
import { useStore } from "../store";
import { ImportDialog } from "./importer";
import { toast } from "./toast";
import { Badge, Button, cx, Select } from "./ui";

/** Opens the given deck in Anki as directly as the device allows. */
export function useOpenAnki() {
  const connected = useDevice((s) => s.ankiConnected);
  return async (deck: string) => {
    const platform = detectPlatform();
    if (platform !== "desktop") {
      window.location.href = phoneAnkiLink(platform, deck);
      return;
    }
    if (connected) {
      try {
        await openDeckOnDesktop(deck);
        toast(`Opened "${deck}" in Anki.`, { tone: "success" });
        return;
      } catch (e) {
        toast(e instanceof AnkiConnectError ? e.message : "Couldn't reach Anki.");
      }
    }
    window.open(ANKIWEB_DECKS_URL, "_blank", "noopener");
    if (!connected) toast("Tip: connect Anki on this computer in Settings to open decks directly.");
  };
}

/** Connect button logic: asks Anki for permission (Anki shows a popup). */
export function useConnectAnki() {
  const setConnected = useDevice((s) => s.setAnkiConnected);
  const [busy, setBusy] = useState(false);
  const connect = async () => {
    setBusy(true);
    try {
      toast("Check Anki: it asks whether to allow StudyMaster.");
      const ok = await requestAnkiPermission();
      setConnected(ok);
      toast(ok ? "Anki is connected." : "Anki said no. You can try again anytime.", { tone: ok ? "success" : "info" });
    } catch (e) {
      toast(e instanceof AnkiConnectError ? e.message : "Something went wrong talking to Anki.");
    } finally {
      setBusy(false);
    }
  };
  return { connect, busy };
}

/** All deck names from Anki on this computer (only while connected). */
export function useAnkiDecks() {
  const connected = useDevice((s) => s.ankiConnected) && detectPlatform() === "desktop";
  const [names, setNames] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setNames(await ankiDeckNames());
    } catch (e) {
      setError(e instanceof AnkiConnectError ? e.message : "Couldn't read your decks from Anki.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (connected) void reload();
  }, [connected, reload]);
  return { connected, names, error, loading, reload };
}

/** Explains how to connect, with a Connect button on computers. */
function ConnectHint({ what }: { what: string }) {
  const platform = detectPlatform();
  const { connect, busy } = useConnectAnki();
  if (platform !== "desktop") {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        To {what}, open StudyMaster on your computer with Anki running. Links you make there work on your phone too.
      </p>
    );
  }
  return (
    <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
      <p>
        To {what}, connect Anki on this computer: install the free add-on <b>AnkiConnect</b> (in Anki: <i>Tools → Add-ons → Get Add-ons…</i>, code{" "}
        <span className="font-mono">2055492159</span>), restart Anki, keep it open and press Connect.
      </p>
      <Button onClick={connect} disabled={busy}>
        {busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Connect Anki
      </Button>
    </div>
  );
}

/** Import dialog tab: pick Anki collections, their sub-decks become the subject's items. */
export function AnkiCollectionPicker({ onDraft }: { onDraft: (draft: Draft) => void }) {
  const subjects = useStore((s) => s.subjects);
  const chunks = useStore((s) => s.chunks);
  const defaultRecording = useStore((s) => s.settings.defaultRecordingMinutes);
  const { connected, names, error, loading, reload } = useAnkiDecks();
  const [chosen, setChosen] = useState<string[]>([]);

  if (!connected) return <ConnectHint what="set up subjects from your Anki decks" />;
  if (error) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-rose-600">{error}</p>
        <Button variant="secondary" onClick={reload}>
          <RefreshCw size={16} /> Try again
        </Button>
      </div>
    );
  }
  if (!names || loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Reading your decks from Anki…
      </div>
    );
  }
  const list = collections(names);
  if (list.length === 0) return <p className="py-8 text-center text-sm text-slate-500">No decks found in Anki yet.</p>;

  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Pick the Anki decks that belong to your subjects. Each one becomes a subject, its sub-decks become the lectures or chapters – and ▶ Anki
        then opens exactly that sub-deck.
      </p>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {list.map((c) => {
          const n = subdecks(names, c).length;
          const linked = subjects.find((s) => s.ankiDeck === c);
          const on = chosen.includes(c);
          return (
            <li key={c}>
              <label className="flex cursor-pointer items-center gap-3 p-3">
                <input
                  type="checkbox"
                  checked={on}
                  onChange={(e) => setChosen(e.target.checked ? [...chosen, c] : chosen.filter((x) => x !== c))}
                  className="h-4 w-4 accent-indigo-600"
                />
                <Layers size={16} className="shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 truncate font-medium">{c}</span>
                {linked && <Badge tone="emerald">linked to {linked.name}</Badge>}
                <span className="shrink-0 text-xs text-slate-500">
                  {n} sub-deck{n === 1 ? "" : "s"}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button disabled={chosen.length === 0} onClick={() => onDraft(draftFromAnki(names, chosen, subjects, chunks, todayISO(), defaultRecording))}>
          Continue with {chosen.length || "the"} deck{chosen.length === 1 ? "" : "s"}
        </Button>
        <Button variant="ghost" onClick={reload}>
          <RefreshCw size={16} /> Refresh
        </Button>
      </div>
    </div>
  );
}

/**
 * Subject editor: link the subject to an Anki deck. Its lectures/chapters are
 * matched to the sub-decks by name; every match can be changed by hand.
 */
export function SubjectAnkiLink({ subject }: { subject: Subject }) {
  const chunks = useStore((s) => s.chunks);
  const upsertSubject = useStore((s) => s.upsertSubject);
  const upsertChunk = useStore((s) => s.upsertChunk);
  const addChunks = useStore((s) => s.addChunks);
  const defaultRecording = useStore((s) => s.settings.defaultRecordingMinutes);
  const { connected, names, error, loading, reload } = useAnkiDecks();
  const own = chunks.filter((c) => c.subjectId === subject.id).sort((a, b) => a.order - b.order);
  const linkedCount = own.filter((c) => c.ankiDeck).length;

  const summary = subject.ankiDeck ? (
    <p className="text-sm text-slate-600 dark:text-slate-400">
      Linked to <span className="font-mono text-xs">{subject.ankiDeck}</span> · {linkedCount} of {own.length} item{own.length === 1 ? "" : "s"} have
      their own deck.
    </p>
  ) : null;

  if (!connected) {
    return (
      <div className="space-y-2">
        {summary}
        <ConnectHint what={subject.ankiDeck ? "change these links" : "link this subject to a deck in Anki"} />
      </div>
    );
  }
  if (error) {
    return (
      <div className="space-y-2 text-sm">
        {summary}
        <p className="text-rose-600">{error}</p>
        <Button variant="secondary" onClick={reload}>
          <RefreshCw size={16} /> Try again
        </Button>
      </div>
    );
  }
  if (!names || loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 size={16} className="animate-spin" /> Reading your decks from Anki…
      </div>
    );
  }

  const all = collections(names);
  const decks = subject.ankiDeck ? subdecks(names, subject.ankiDeck) : [];
  const used = new Set(own.map((c) => c.ankiDeck).filter(Boolean));
  const unused = decks.filter((d) => !used.has(d));

  /** Links the unlinked items to sub-decks with similar names. */
  const autoMatch = (collection: string, current = own) => {
    const subs = subdecks(names, collection);
    const taken = new Set(current.map((c) => c.ankiDeck).filter(Boolean));
    const found = matchDecks(current.filter((c) => !c.ankiDeck), subs.filter((d) => !taken.has(d)));
    for (const c of current) if (found.has(c.id)) upsertChunk({ ...c, ankiDeck: found.get(c.id) });
    return found.size;
  };

  const chooseCollection = (collection: string) => {
    if (!collection) {
      upsertSubject({ ...subject, ankiDeck: undefined });
      for (const c of own) if (c.ankiDeck) upsertChunk({ ...c, ankiDeck: undefined });
      return;
    }
    upsertSubject({ ...subject, ankiDeck: collection });
    // Links into another collection don't fit any more.
    const kept = own.map((c) => (c.ankiDeck && !c.ankiDeck.startsWith(`${collection}::`) ? { ...c, ankiDeck: undefined } : c));
    for (const c of kept) if (c.ankiDeck !== own.find((o) => o.id === c.id)?.ankiDeck) upsertChunk(c);
    const n = autoMatch(collection, kept);
    toast(n ? `Linked ${n} item${n === 1 ? "" : "s"} by name. Check the list below.` : "Linked the deck. Pick the sub-deck for each item below.", {
      tone: "success",
    });
  };

  const addUnused = () => {
    let order = Math.max(0, ...own.map((c) => c.order));
    addChunks(
      [...unused]
        .sort((a, b) => (lectureNumber(leaf(a)) ?? 999) - (lectureNumber(leaf(b)) ?? 999))
        .map((deck) => ({ id: newId(), subjectId: subject.id, title: leaf(deck), recordingMinutes: defaultRecording, pages: 0, slides: 0, order: ++order, ankiDeck: deck })),
    );
    toast(`Added ${unused.length} item${unused.length === 1 ? "" : "s"} from Anki. Add their pages or slides.`, { tone: "success" });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          className="w-full sm:w-72"
          aria-label="Anki deck"
          value={subject.ankiDeck ?? ""}
          onChange={chooseCollection}
          options={[
            { value: "", label: "Not linked" },
            ...(subject.ankiDeck && !all.includes(subject.ankiDeck) ? [subject.ankiDeck] : []).concat(all).map((c) => ({ value: c, label: c })),
          ]}
        />
        <Button variant="ghost" onClick={reload} title="Read the decks from Anki again">
          <RefreshCw size={16} />
        </Button>
      </div>
      {subject.ankiDeck && (
        <>
          {own.length > 0 && (
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {own.map((c) => (
                <li key={c.id} className="flex flex-col gap-1.5 p-2.5 sm:flex-row sm:items-center sm:gap-3">
                  <span className={cx("min-w-0 flex-1 truncate text-sm", !c.ankiDeck && "text-slate-500")}>{c.title}</span>
                  <Select
                    className="w-full py-1.5 text-sm sm:w-64"
                    aria-label={`Anki deck for ${c.title}`}
                    value={c.ankiDeck ?? ""}
                    onChange={(v) => upsertChunk({ ...c, ankiDeck: v || undefined })}
                    options={[
                      { value: "", label: "Whole subject deck" },
                      ...decks.filter((d) => d === c.ankiDeck || !used.has(d)).map((d) => ({ value: d, label: leaf(d) })),
                      ...(c.ankiDeck && !decks.includes(c.ankiDeck) ? [{ value: c.ankiDeck, label: leaf(c.ankiDeck) }] : []),
                    ]}
                  />
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-2">
            {own.some((c) => !c.ankiDeck) && unused.length > 0 && (
              <Button
                variant="secondary"
                onClick={() => {
                  const n = autoMatch(subject.ankiDeck!);
                  toast(n ? `Linked ${n} more item${n === 1 ? "" : "s"}.` : "No similar names found – pick the decks by hand.");
                }}
              >
                <Wand2 size={16} /> Match by name
              </Button>
            )}
            {unused.length > 0 && (
              <Button variant="secondary" onClick={addUnused}>
                <Plus size={16} /> Add {unused.length} sub-deck{unused.length === 1 ? "" : "s"} as new item{unused.length === 1 ? "" : "s"}
              </Button>
            )}
          </div>
          {decks.length === 0 && <p className="text-xs text-slate-500">This deck has no sub-decks, so ▶ Anki opens the whole deck.</p>}
        </>
      )}
    </div>
  );
}

/** Settings section: connect desktop Anki, create decks, import decks. */
export function AnkiConnectSection() {
  const platform = detectPlatform();
  const connected = useDevice((s) => s.ankiConnected);
  const setConnected = useDevice((s) => s.setAnkiConnected);
  const subjects = useStore((s) => s.subjects);
  const chunks = useStore((s) => s.chunks);
  const { connect, busy: connecting } = useConnectAnki();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const createDecks = async () => {
    setCreating(true);
    try {
      const names = subjects.flatMap((s) => [deckForSubject(s), ...chunks.filter((c) => c.subjectId === s.id).map((c) => deckForChunk(c, s))]);
      const created = await createAnkiDecks([...new Set(names)]);
      toast(created ? `Created ${created} deck${created === 1 ? "" : "s"} in Anki.` : "All decks already exist in Anki.", { tone: "success" });
    } catch (e) {
      toast(e instanceof AnkiConnectError ? e.message : "Something went wrong talking to Anki.");
    } finally {
      setCreating(false);
    }
  };

  if (platform !== "desktop") {
    return (
      <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
        <p>
          On your phone, tapping an <b>Anki</b> task opens the {platform === "android" ? "AnkiDroid" : "AnkiMobile"} app
          {platform === "ios" ? " at that deck (AnkiMobile 25.07 or newer)" : ""}.
        </p>
        <p>
          To link subjects to your Anki decks or create decks, open StudyMaster on your computer with Anki running. The decks then reach your phone
          through AnkiWeb sync as usual.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {connected ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 size={18} className="text-emerald-600" />
          <span className="font-medium">Connected to Anki on this computer</span>
          <Badge tone="emerald">AnkiConnect</Badge>
        </div>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
          <li>
            In Anki: <i>Tools → Add-ons → Get Add-ons…</i> and enter <span className="font-mono">2055492159</span> (AnkiConnect). Restart Anki.
          </li>
          <li>Keep Anki open and press Connect. Anki asks once whether to allow StudyMaster.</li>
        </ol>
      )}
      <div className="flex flex-wrap gap-2">
        {connected ? (
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Download size={16} /> Set up subjects from Anki
            </Button>
            <Button variant="secondary" onClick={createDecks} disabled={creating || subjects.length === 0}>
              {creating ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />} Create missing decks in Anki
            </Button>
            <Button variant="ghost" onClick={() => setConnected(false)}>
              <Unplug size={16} /> Disconnect
            </Button>
          </>
        ) : (
          <>
            <Button onClick={connect} disabled={connecting}>
              {connecting ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Connect Anki
            </Button>
            <Button variant="ghost" onClick={() => window.open(ANKIWEB_DECKS_URL, "_blank", "noopener")}>
              <ExternalLink size={16} /> Use AnkiWeb instead
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Link each subject to its Anki deck in <b>Subjects</b> (or set subjects up from Anki above). ▶ Anki then opens exactly the deck of the lecture
        or chapter you just studied. Without a link, decks are named <span className="font-mono">Subject::Lecture</span>.
      </p>
      <ImportDialog open={importing} initialMode="anki" onClose={() => setImporting(false)} />
    </div>
  );
}
