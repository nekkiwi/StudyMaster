import type { Chunk, Subject } from "@studymaster/core";
import { CheckCircle2, Download, ExternalLink, FolderPlus, Layers, Link2, Loader2, Plus, RefreshCw, Unplug, Wand2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { create } from "zustand";
import {
  ANKIWEB_DECKS_URL,
  AnkiConnectError,
  ankiWebHint,
  ankiDeckNames,
  collections,
  createAnkiDecks,
  deckForSubject,
  deckName,
  detectPlatform,
  isDesktopSafari,
  leaf,
  matchDecks,
  openDeckOnDesktop,
  phoneAnkiLink,
  requestAnkiPermission,
  subdeckName,
  subdecks,
} from "../lib/anki";
import { readAnki, withCardCounts } from "../lib/ankiSync";
import { useDevice } from "../lib/device";
import { newId, todayISO } from "../lib/format";
import { draftFromAnki, lectureNumber, type Draft } from "../lib/importer";
import { useStore } from "../store";
import { ImportDialog } from "./importer";
import { toast } from "./toast";
import { Badge, Button, cx, Field, Modal, Segmented, Select } from "./ui";

/** The last read from Anki on this computer (not saved; refreshed while the app is open). */
export const useAnkiSync = create<{ busy: boolean; error: string | null; unlinked: Record<string, string[]>; hidden: boolean }>(() => ({
  busy: false,
  error: null,
  unlinked: {},
  hidden: false,
}));

let running: Promise<void> | null = null;

/** Whether this device can talk to desktop Anki right now (connected, not Safari, not a phone). */
export function canTalkToAnki(): boolean {
  return detectPlatform() === "desktop" && !isDesktopSafari() && useDevice.getState().ankiConnected;
}

/**
 * Reads deck names/ids, card counts and due counts from Anki and stores them
 * (they sync to the account, so phones get the numbers too).
 */
export function syncAnki(): Promise<void> {
  if (running) return running;
  if (!canTalkToAnki()) return Promise.resolve();
  running = (async () => {
    useAnkiSync.setState({ busy: true });
    try {
      const st = useStore.getState();
      const reading = await readAnki(st.subjects, st.chunks, todayISO());
      useStore.getState().applyAnkiReading(reading);
      useAnkiSync.setState({ error: null, unlinked: reading.unlinked });
    } catch (e) {
      useAnkiSync.setState({ error: e instanceof AnkiConnectError ? e.message : "Couldn't read from Anki." });
    } finally {
      useAnkiSync.setState({ busy: false });
      running = null;
    }
  })();
  return running;
}

/** Keeps the Anki numbers fresh while StudyMaster is open on a connected computer. Mounted once in App. */
export function AnkiAutoSync() {
  const connected = useDevice((s) => s.ankiConnected);
  const setupDone = useStore((s) => s.setupDone);
  useEffect(() => {
    if (!connected || !setupDone) return;
    void syncAnki();
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible" || Date.now() - last < 60_000) return;
      last = Date.now();
      void syncAnki();
    };
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    const timer = setInterval(refresh, 5 * 60_000);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      clearInterval(timer);
    };
  }, [connected, setupDone]);
  return null;
}

/**
 * Creates Anki decks for items without one and links them: in a linked
 * subject "Collection::Title" (except items set to "whole subject deck"),
 * otherwise "Subject" and "Subject::Title". Returns how many decks were new.
 */
export async function createMissingDecks(only?: { subjectIds?: string[]; chunkIds?: string[] }): Promise<number> {
  const { subjects, chunks } = useStore.getState();
  const names: string[] = [];
  const links: { chunkId: string; deck: string }[] = [];
  for (const s of subjects) {
    if (only?.subjectIds && !only.subjectIds.includes(s.id)) continue;
    const own = chunks.filter((c) => c.subjectId === s.id && (!only?.chunkIds || only.chunkIds.includes(c.id)));
    if (s.ankiDeck) {
      for (const c of own) {
        if (c.ankiDeck || c.ankiNoDeck) continue;
        const deck = subdeckName(s.ankiDeck, c.title);
        names.push(deck);
        links.push({ chunkId: c.id, deck });
      }
    } else {
      if (!only?.chunkIds) names.push(deckForSubject(s));
      for (const c of own) names.push(deckName(s.name, c.title));
    }
  }
  const created = await createAnkiDecks(names);
  const { upsertChunk } = useStore.getState();
  for (const l of links) {
    const c = useStore.getState().chunks.find((x) => x.id === l.chunkId);
    if (c) upsertChunk({ ...c, ankiDeck: l.deck, ankiDeckId: created[l.deck] });
  }
  void syncAnki();
  return Object.keys(created).length;
}

/** Adds Anki sub-decks as new items of a subject, each linked to its deck. */
export function addDecksAsItems(subject: Subject, decks: string[]): number {
  const { chunks, addChunks, settings } = useStore.getState();
  let order = Math.max(0, ...chunks.filter((c) => c.subjectId === subject.id).map((c) => c.order));
  addChunks(
    [...decks]
      .sort((a, b) => (lectureNumber(leaf(a)) ?? 999) - (lectureNumber(leaf(b)) ?? 999))
      .map((deck) => ({
        id: newId(),
        subjectId: subject.id,
        title: leaf(deck),
        recordingMinutes: 0, // Anki decks are about the cards; video, pages, slides can be added later
        pages: 0,
        slides: 0,
        order: ++order,
        ankiDeck: deck,
      })),
  );
  useAnkiSync.setState((st) => ({ unlinked: { ...st.unlinked, [subject.id]: (st.unlinked[subject.id] ?? []).filter((d) => !decks.includes(d)) } }));
  void syncAnki();
  return decks.length;
}

/** Items of a linked subject that have no deck in Anki yet (and weren't set to "whole subject deck"). */
export function itemsWithoutDeck(subject: Subject, chunks: Chunk[]): Chunk[] {
  if (!subject.ankiDeck) return [];
  return chunks.filter((c) => c.subjectId === subject.id && !c.ankiDeck && !c.ankiNoDeck);
}

/** Which deck the "open in Anki" dialog is about (desktop only). */
type PromptReason = "connect" | "closed" | "safari";
const useAnkiPrompt = create<{ deck: string | null; reason: PromptReason; show(deck: string, reason: PromptReason): void; hide(): void }>(
  (set) => ({
    deck: null,
    reason: "connect",
    show: (deck, reason) => set({ deck, reason }),
    hide: () => set({ deck: null }),
  }),
);

/**
 * Opens the given deck in Anki as directly as the device allows:
 * computer → desktop Anki at that deck (asks to connect the first time),
 * iPhone → AnkiMobile studies it, Android → AnkiDroid shows its cards.
 */
/** Opens AnkiWeb in a new tab and says which deck to open there. */
export function openAnkiWeb(deck: string) {
  window.open(ANKIWEB_DECKS_URL, "_blank", "noopener");
  toast(ankiWebHint(deck));
}

export function useOpenAnki() {
  const connected = useDevice((s) => s.ankiConnected);
  const ankiWeb = useDevice((s) => s.ankiWeb);
  const show = useAnkiPrompt((s) => s.show);
  return async (deck: string) => {
    // AnkiWeb users: no app, no connection – open AnkiWeb (must happen right in the tap).
    if (ankiWeb) return openAnkiWeb(deck);
    const platform = detectPlatform();
    if (platform !== "desktop") {
      window.location.href = phoneAnkiLink(platform, deck);
      return;
    }
    if (isDesktopSafari()) return show(deck, "safari");
    if (!connected) return show(deck, "connect");
    try {
      if (await openDeckOnDesktop(deck)) toast(`Opened "${deck}" in Anki.`, { tone: "success" });
      else toast(missingDeck(deck));
    } catch {
      show(deck, "closed");
    }
  };
}

const missingDeck = (deck: string) =>
  `Anki has no deck "${deck}" yet. Link this subject to its Anki deck in Subjects, or create the decks in Settings → Anki.`;

/** Safari on a Mac can't talk to desktop Anki. */
function SafariNote() {
  return (
    <p>
      Safari doesn't let websites talk to apps on your Mac, so it can't open Anki. Open StudyMaster in <b>Chrome</b>, <b>Edge</b> or <b>Firefox</b>{" "}
      for this (your plan is the same when you're signed in) – or use AnkiWeb in the meantime.
    </p>
  );
}

/** Desktop dialog: connect Anki (once) or open it, then opens the deck. Mounted once in App. */
export function AnkiPromptDialog() {
  const { deck, reason, hide } = useAnkiPrompt();
  const setConnected = useDevice((s) => s.setAnkiConnected);
  const setAnkiWeb = useDevice((s) => s.setAnkiWeb);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setError(null);
    hide();
  };
  const go = async () => {
    if (!deck) return;
    setBusy(true);
    setError(null);
    try {
      if (reason === "connect") {
        const ok = await requestAnkiPermission();
        setConnected(ok);
        if (!ok) {
          setError("Anki said no. Press the button again and choose “Yes” in Anki.");
          return;
        }
      }
      if (await openDeckOnDesktop(deck)) toast(`Opened "${deck}" in Anki.`, { tone: "success" });
      else toast(missingDeck(deck));
      close();
    } catch (e) {
      setError(
        e instanceof AnkiConnectError && !/reachable/.test(e.message)
          ? `Anki says: ${e.message}`
          : "Anki isn't reachable. Is Anki open, with the AnkiConnect add-on installed (and Anki restarted after installing it)? If your browser asked about access to apps on this device and you said no, allow it via the icon left of the web address (Site settings).",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={!!deck}
      onClose={close}
      title="Open in Anki"
      footer={
        <>
          <Button
            variant="ghost"
            onClick={() => {
              if (deck) openAnkiWeb(deck);
              setAnkiWeb(true);
              close();
            }}
          >
            <ExternalLink size={16} /> I only use AnkiWeb
          </Button>
          {reason !== "safari" && (
            <Button onClick={go} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : reason === "connect" ? <Link2 size={16} /> : <RefreshCw size={16} />}
              {reason === "connect" ? "Connect and open" : "Try again"}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
        <p>
          This opens <span className="font-mono text-xs text-slate-900 dark:text-white">{deck}</span> in Anki on this computer.
        </p>
        {reason === "connect" ? (
          <>
            <p>
              A website can only open a deck in the Anki app through the free AnkiConnect add-on. Set it up once on this computer – or, if you
              study on AnkiWeb in the browser, choose <b>I only use AnkiWeb</b>.
            </p>
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>
                In Anki: <i>Tools → Add-ons → Get Add-ons…</i>, enter <span className="font-mono">2055492159</span>, then restart Anki.
              </li>
              <li>Keep Anki open and press <b>Connect and open</b>.</li>
              <li>
                Your browser may ask to let this site access <b>apps on this device</b> – choose <b>Allow</b>. Then Anki asks whether to allow
                StudyMaster – choose <b>Yes</b>.
              </li>
            </ol>
          </>
        ) : reason === "safari" ? (
          <SafariNote />
        ) : (
          <p>Anki didn't answer. Open Anki on this computer, then press Try again.</p>
        )}
        {error && <p className="rounded-xl bg-rose-50 p-3 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}
      </div>
    </Modal>
  );
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
      if (ok) void syncAnki();
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
  const ankiWeb = useDevice((s) => s.ankiWeb);
  const { connect, busy } = useConnectAnki();
  if (ankiWeb) {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        To {what}, StudyMaster needs the free Anki app on a computer – AnkiWeb can't be connected to other websites. ▶ Anki still works: it opens
        AnkiWeb and tells you which deck to open.
      </p>
    );
  }
  if (platform !== "desktop") {
    return (
      <p className="text-sm text-slate-600 dark:text-slate-400">
        To {what}, open StudyMaster on your computer with Anki running. Links you make there work on your phone too.
      </p>
    );
  }
  if (isDesktopSafari()) {
    return (
      <div className="text-sm text-slate-600 dark:text-slate-400">
        <SafariNote />
      </div>
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
  const [counting, setCounting] = useState(false);

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
        <Button
          disabled={chosen.length === 0 || counting}
          onClick={async () => {
            const draft = draftFromAnki(names, chosen, subjects, chunks, todayISO(), defaultRecording);
            setCounting(true);
            try {
              onDraft(await withCardCounts(draft));
            } catch {
              onDraft(draft); // counts come with the next read from Anki
            } finally {
              setCounting(false);
            }
          }}
        >
          {counting ? <Loader2 size={16} className="animate-spin" /> : null} Continue with {chosen.length || "the"} deck{chosen.length === 1 ? "" : "s"}
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
  const { connected, names, error, loading, reload } = useAnkiDecks();
  const [creating, setCreating] = useState(false);
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
    const found = matchDecks(current.filter((c) => !c.ankiDeck && !c.ankiNoDeck), subs.filter((d) => !taken.has(d)));
    for (const c of current) if (found.has(c.id)) upsertChunk({ ...c, ankiDeck: found.get(c.id) });
    return found.size;
  };
  const missing = itemsWithoutDeck(subject, own);
  const createDecks = async () => {
    setCreating(true);
    try {
      const n = await createMissingDecks({ subjectIds: [subject.id] });
      toast(`Created ${n} deck${n === 1 ? "" : "s"} in Anki and linked them.`, { tone: "success" });
      await reload();
    } catch (e) {
      toast(e instanceof AnkiConnectError ? e.message : "Something went wrong talking to Anki.");
    } finally {
      setCreating(false);
    }
  };

  const chooseCollection = (collection: string) => {
    if (!collection) {
      upsertSubject({ ...subject, ankiDeck: undefined });
      for (const c of own) if (c.ankiDeck || c.ankiNoDeck) upsertChunk({ ...c, ankiDeck: undefined, ankiNoDeck: undefined });
      void syncAnki();
      return;
    }
    upsertSubject({ ...subject, ankiDeck: collection });
    // Links into another collection don't fit any more.
    const kept = own.map((c) => (c.ankiDeck && !c.ankiDeck.startsWith(`${collection}::`) ? { ...c, ankiDeck: undefined } : c));
    for (const c of kept) if (c.ankiDeck !== own.find((o) => o.id === c.id)?.ankiDeck) upsertChunk(c);
    const n = autoMatch(collection, kept);
    void syncAnki();
    toast(n ? `Linked ${n} item${n === 1 ? "" : "s"} by name. Check the list below.` : "Linked the deck. Pick the sub-deck for each item below.", {
      tone: "success",
    });
  };

  const addUnused = () => {
    addDecksAsItems(subject, unused);
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
                  {c.ankiCards !== undefined && (
                    <span className="shrink-0 text-xs text-slate-500 tabular-nums">
                      {c.ankiCards} card{c.ankiCards === 1 ? "" : "s"}
                    </span>
                  )}
                  <Select
                    className="w-full py-1.5 text-sm sm:w-64"
                    aria-label={`Anki deck for ${c.title}`}
                    value={c.ankiDeck ?? ""}
                    onChange={(v) => {
                      upsertChunk({ ...c, ankiDeck: v || undefined, ankiNoDeck: v ? undefined : true });
                      void syncAnki();
                    }}
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
            {missing.length > 0 && (
              <Button variant="secondary" onClick={createDecks} disabled={creating}>
                {creating ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />} Create {missing.length} missing sub-deck
                {missing.length === 1 ? "" : "s"} in Anki
              </Button>
            )}
          </div>
          {decks.length === 0 && missing.length === 0 && (
            <p className="text-xs text-slate-500">This deck has no sub-decks, so ▶ Anki opens the whole deck.</p>
          )}
          <p className="text-xs text-slate-500">
            Renaming decks in Anki is fine – the links follow. New lectures you add here get their own sub-deck in Anki automatically.
          </p>
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

  const ankiWeb = useDevice((s) => s.ankiWeb);
  const setAnkiWeb = useDevice((s) => s.setAnkiWeb);

  const createDecks = async () => {
    setCreating(true);
    try {
      const created = await createMissingDecks();
      toast(created ? `Created ${created} deck${created === 1 ? "" : "s"} in Anki.` : "All decks already exist in Anki.", { tone: "success" });
    } catch (e) {
      toast(e instanceof AnkiConnectError ? e.message : "Something went wrong talking to Anki.");
    } finally {
      setCreating(false);
    }
  };

  const modeChoice = (
    <Field label="How do you study Anki on this device?" group>
      <Segmented
        value={ankiWeb ? "web" : "app"}
        onChange={(v) => setAnkiWeb(v === "web")}
        options={[
          { value: "app", label: platform === "desktop" ? "Anki app" : platform === "android" ? "AnkiDroid app" : "AnkiMobile app" },
          { value: "web", label: "AnkiWeb (browser)" },
        ]}
      />
    </Field>
  );

  if (ankiWeb) {
    return (
      <div className="space-y-3">
        {modeChoice}
        <AnkiNumbers refresh={false} />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          ▶ Anki opens AnkiWeb in a new tab and tells you which deck to open. AnkiWeb can't be connected to other websites (it has no interface
          for that), so StudyMaster can't open a deck there directly or read your card numbers.
        </p>
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Want the full connection (open the exact deck, real card counts in your plan)? Install the free Anki app on a computer once and connect
          it here. Your cards stay on AnkiWeb as before – the app just syncs with it.
        </p>
      </div>
    );
  }

  if (platform !== "desktop") {
    return (
      <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
        {modeChoice}
        <p>
          {platform === "ios" ? (
            <>
              On your iPhone, ▶ Anki opens AnkiMobile and starts studying exactly that deck (AnkiMobile 25.07 or newer).
            </>
          ) : (
            <>
              On Android, ▶ Anki opens AnkiDroid showing exactly that deck's cards (AnkiDroid 2.25 or newer – otherwise the Play Store opens to update
              it). AnkiDroid doesn't let websites start a study session directly yet.
            </>
          )}
        </p>
        <AnkiNumbers refresh={false} />
        <p>
          To link subjects to your Anki decks or create decks, open StudyMaster on your computer with Anki running. The decks then reach your phone
          through AnkiWeb sync as usual.
        </p>
      </div>
    );
  }

  if (isDesktopSafari()) {
    return (
      <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
        {modeChoice}
        <SafariNote />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {modeChoice}
      {connected ? (
        <div className="flex items-center gap-2 text-sm">
          <CheckCircle2 size={18} className="text-emerald-600" />
          <span className="font-medium">Connected to Anki on this computer</span>
          <Badge tone="emerald">AnkiConnect</Badge>
        </div>
      ) : null}
      {connected ? (
        <AnkiNumbers />
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
          <li>
            In Anki: <i>Tools → Add-ons → Get Add-ons…</i> and enter <span className="font-mono">2055492159</span> (AnkiConnect). Restart Anki.
          </li>
          <li>
            Keep Anki open and press Connect. Your browser may ask to allow access to apps on this device (choose Allow), then Anki asks once
            whether to allow StudyMaster.
          </li>
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

function ago(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

/** "Read from Anki 2 min ago · 840 cards · 95 due today · Refresh" (shown on every device). */
export function AnkiNumbers({ refresh = true }: { refresh?: boolean }) {
  const { busy, error } = useAnkiSync();
  const readAt = useStore((s) => s.ankiReadAt);
  const due = useStore((s) => s.ankiDue);
  const chunks = useStore((s) => s.chunks);
  if (!readAt && !error) return null;
  const cards = chunks.reduce((a, c) => a + (c.ankiCards ?? 0), 0);
  const today = todayISO();
  const dueToday = Object.values(due ?? {}).reduce((a, days) => a + (days[today] ?? 0), 0);
  const canRefresh = refresh && canTalkToAnki();
  return (
    <div className="space-y-1 text-sm">
      {readAt && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-slate-600 dark:text-slate-400">
          <span>Read from Anki {ago(readAt)}</span>
          {cards > 0 && <span>· {cards.toLocaleString()} cards in your lecture decks</span>}
          {due?.[Object.keys(due)[0] ?? ""]?.[today] !== undefined && <span>· {dueToday.toLocaleString()} reviews due today</span>}
          {canRefresh && (
            <button type="button" onClick={() => void syncAnki()} disabled={busy} className="inline-flex items-center gap-1 font-medium text-indigo-600 hover:underline disabled:opacity-50 dark:text-indigo-400">
              <RefreshCw size={13} className={busy ? "animate-spin" : ""} /> Refresh
            </button>
          )}
        </p>
      )}
      {error && canRefresh && <p className="text-xs text-amber-700 dark:text-amber-400">Couldn't read from Anki just now: {error}</p>}
    </div>
  );
}

/**
 * Subjects page: what doesn't match between StudyMaster and Anki yet –
 * new sub-decks in Anki, and lectures without a sub-deck.
 */
export function AnkiSuggestions() {
  const subjects = useStore((s) => s.subjects);
  const chunks = useStore((s) => s.chunks);
  const { unlinked, hidden } = useAnkiSync();
  const connected = useDevice((s) => s.ankiConnected);
  const [busy, setBusy] = useState<string | null>(null);
  if (hidden || !connected || !canTalkToAnki()) return null;
  const rows = subjects
    .map((s) => ({ subject: s, fresh: unlinked[s.id] ?? [], missing: itemsWithoutDeck(s, chunks) }))
    .filter((r) => r.fresh.length > 0 || r.missing.length > 0);
  if (rows.length === 0) return null;

  const create = async (subject: Subject) => {
    setBusy(subject.id);
    try {
      const n = await createMissingDecks({ subjectIds: [subject.id] });
      toast(`Created ${n} sub-deck${n === 1 ? "" : "s"} in Anki.`, { tone: "success" });
    } catch (e) {
      toast(e instanceof AnkiConnectError ? e.message : "Something went wrong talking to Anki.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 dark:border-sky-500/30 dark:bg-sky-500/5">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-2 font-semibold">
          <Layers size={16} className="text-sky-600" /> Keep Anki and StudyMaster in step
        </p>
        <button type="button" onClick={() => useAnkiSync.setState({ hidden: true })} className="text-xs text-slate-500 hover:underline">
          Not now
        </button>
      </div>
      <ul className="space-y-2 text-sm">
        {rows.map(({ subject, fresh, missing }) => (
          <li key={subject.id} className="flex flex-wrap items-center gap-2">
            <span className="min-w-0 font-medium">{subject.name}:</span>
            {fresh.length > 0 && (
              <>
                <span className="text-slate-600 dark:text-slate-400">
                  {fresh.length} new sub-deck{fresh.length === 1 ? "" : "s"} in Anki
                </span>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    const n = addDecksAsItems(subject, fresh);
                    toast(`Added ${n} item${n === 1 ? "" : "s"} to ${subject.name}. Add their pages or slides.`, { tone: "success" });
                  }}
                >
                  <Plus size={14} /> Add as lectures
                </Button>
              </>
            )}
            {missing.length > 0 && (
              <>
                <span className="text-slate-600 dark:text-slate-400">
                  {missing.length} item{missing.length === 1 ? "" : "s"} without a sub-deck
                </span>
                <Button size="sm" variant="secondary" onClick={() => create(subject)} disabled={busy === subject.id}>
                  {busy === subject.id ? <Loader2 size={14} className="animate-spin" /> : <FolderPlus size={14} />} Create in Anki
                </Button>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

type AnkiUse = "app" | "web" | "phone" | "none";

/**
 * Setup wizard step: does the user use Anki, and how? Then a step-by-step
 * setup for the chosen way (computer app + AnkiConnect, AnkiWeb, phone app).
 */
export function AnkiOnboarding() {
  const platform = detectPlatform();
  const connected = useDevice((s) => s.ankiConnected);
  const ankiWeb = useDevice((s) => s.ankiWeb);
  const setAnkiWeb = useDevice((s) => s.setAnkiWeb);
  const workflow = useStore((s) => s.settings.workflow);
  const update = useStore((s) => s.updateSettings);
  const { connect, busy } = useConnectAnki();
  const usesAnkiNow = workflow.includes("anki") || workflow.includes("cards");
  const [use, setUse] = useState<AnkiUse | null>(
    !usesAnkiNow ? "none" : ankiWeb ? "web" : connected ? "app" : null,
  );

  const choose = (u: AnkiUse) => {
    setUse(u);
    setAnkiWeb(u === "web");
    if (u === "none") {
      const rest = workflow.filter((a) => a !== "anki" && a !== "cards");
      update({ workflow: rest.length ? rest : ["read", "summary", "revise"] });
    } else if (!workflow.includes("anki")) {
      update({ workflow: [...workflow, "anki"] });
    }
  };

  const options: { value: AnkiUse; title: string; text: string }[] = [
    { value: "app", title: "Yes – the Anki app on a computer", text: "Windows, Mac or Linux. Best: StudyMaster opens the exact deck and reads your card numbers." },
    { value: "web", title: "Yes – only AnkiWeb in the browser", text: "No app installed. ▶ Anki opens AnkiWeb and tells you which deck to open." },
    { value: "phone", title: "Yes – the app on my phone", text: "AnkiDroid or AnkiMobile. ▶ Anki opens the app." },
    { value: "none", title: "No, I don't use Anki", text: "No Anki time is planned. You can turn it on later in Settings." },
  ];

  const step = (n: number, done: boolean, title: string, body: React.ReactNode) => (
    <li className="flex gap-3">
      <span
        className={cx(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
          done ? "bg-emerald-500 text-white" : "bg-indigo-600 text-white",
        )}
      >
        {done ? <CheckCircle2 size={16} /> : n}
      </span>
      <div className="min-w-0 flex-1 space-y-1.5 pb-1">
        <p className="font-semibold">{title}</p>
        <div className="text-sm text-slate-600 dark:text-slate-400">{body}</div>
      </div>
    </li>
  );

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            aria-pressed={use === o.value}
            onClick={() => choose(o.value)}
            className={cx(
              "rounded-2xl border-2 p-4 text-left transition",
              use === o.value
                ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10"
                : "border-slate-200 hover:border-indigo-300 dark:border-slate-700",
            )}
          >
            <span className="block font-semibold">{o.title}</span>
            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{o.text}</span>
          </button>
        ))}
      </div>

      {use === "app" && platform !== "desktop" && (
        <p className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Connecting the Anki app works on a computer. Finish setting up here, then open StudyMaster on your computer and go to Settings → Anki –
          the steps are there too. Your plan syncs when you're signed in.
        </p>
      )}
      {use === "app" && platform === "desktop" && isDesktopSafari() && (
        <div className="rounded-2xl bg-amber-50 p-4 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <SafariNote />
        </div>
      )}
      {use === "app" && platform === "desktop" && !isDesktopSafari() && (
        <ol className="space-y-4 rounded-2xl border border-slate-200 p-4 dark:border-slate-800">
          {step(
            1,
            connected,
            "Install the free Anki app",
            <>
              Skip this if you have it. Download it from{" "}
              <a href="https://apps.ankiweb.net" target="_blank" rel="noopener" className="font-medium text-indigo-600 underline dark:text-indigo-400">
                apps.ankiweb.net
              </a>{" "}
              and sign in with your AnkiWeb account so your cards sync.
            </>,
          )}
          {step(
            2,
            connected,
            "Add the AnkiConnect add-on",
            <>
              In Anki: <i>Tools → Add-ons → Get Add-ons…</i>, enter the code <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">2055492159</span>{" "}
              and press OK. Then <b>restart Anki</b>.
            </>,
          )}
          {step(
            3,
            connected,
            "Connect",
            connected ? (
              <span className="font-medium text-emerald-700 dark:text-emerald-400">Connected – ▶ Anki now opens the exact deck.</span>
            ) : (
              <div className="space-y-2">
                <p>
                  Keep Anki open and press Connect. Your browser may ask to allow access to apps on this device (choose <b>Allow</b>), then Anki asks
                  whether to allow StudyMaster (choose <b>Yes</b>).
                </p>
                <Button onClick={connect} disabled={busy}>
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Connect Anki
                </Button>
              </div>
            ),
          )}
          {step(
            4,
            false,
            "Link your decks (later)",
            <>In the next step, pick “From your Anki deck” for a subject: its sub-decks become the lectures, with their card counts.</>,
          )}
        </ol>
      )}
      {use === "web" && (
        <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-400">
          ▶ Anki will open AnkiWeb in a new tab and tell you which deck to open. AnkiWeb can't be connected to other websites, so StudyMaster can't
          read your card numbers – install the free Anki app on a computer anytime for that (Settings → Anki).
        </p>
      )}
      {use === "phone" && (
        <p className="rounded-2xl bg-slate-50 p-4 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-400">
          ▶ Anki opens {platform === "ios" ? "AnkiMobile at the right deck" : "AnkiDroid at the right deck's cards"}. To link subjects to your decks
          and see card numbers in your plan, connect the Anki app on a computer once (Settings → Anki there).
        </p>
      )}
    </div>
  );
}
