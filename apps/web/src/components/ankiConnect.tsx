import { CheckCircle2, Download, ExternalLink, FolderPlus, Link2, Loader2, Unplug } from "lucide-react";
import { useState } from "react";
import {
  ANKIWEB_DECKS_URL,
  AnkiConnectError,
  ankiDeckNames,
  createAnkiDecks,
  deckName,
  detectPlatform,
  openDeckOnDesktop,
  phoneAnkiLink,
  requestAnkiPermission,
  structureFromDecks,
} from "../lib/anki";
import { useDevice } from "../lib/device";
import { todayISO } from "../lib/format";
import { draftFromAnki, type Draft } from "../lib/importer";
import { useStore } from "../store";
import { ImportDialog } from "./importer";
import { toast } from "./toast";
import { Badge, Button } from "./ui";

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

/** Settings section: connect desktop Anki, create decks, import decks. */
export function AnkiConnectSection() {
  const platform = detectPlatform();
  const connected = useDevice((s) => s.ankiConnected);
  const setConnected = useDevice((s) => s.setAnkiConnected);
  const subjects = useStore((s) => s.subjects);
  const chunks = useStore((s) => s.chunks);
  const defaultRecording = useStore((s) => s.settings.defaultRecordingMinutes);
  const [busy, setBusy] = useState<"connect" | "create" | "import" | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);

  const run = async (what: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(what);
    try {
      await fn();
    } catch (e) {
      toast(e instanceof AnkiConnectError ? e.message : "Something went wrong talking to Anki.");
    } finally {
      setBusy(null);
    }
  };

  const connect = () =>
    run("connect", async () => {
      toast("Check Anki: it asks whether to allow StudyMaster.");
      const ok = await requestAnkiPermission();
      setConnected(ok);
      toast(ok ? "Anki is connected." : "Anki said no. You can try again anytime.", { tone: ok ? "success" : "info" });
    });

  const createDecks = () =>
    run("create", async () => {
      const names = subjects.flatMap((s) => [
        deckName(s.name),
        ...chunks.filter((c) => c.subjectId === s.id).map((c) => deckName(s.name, c.title)),
      ]);
      const created = await createAnkiDecks(names);
      toast(created ? `Created ${created} deck${created === 1 ? "" : "s"} in Anki.` : "All decks already exist in Anki.", { tone: "success" });
    });

  const importDecks = () =>
    run("import", async () => {
      const structure = structureFromDecks(await ankiDeckNames());
      const d = draftFromAnki(structure, subjects, todayISO(), defaultRecording, chunks);
      if (d.subjects.length === 0) toast("Nothing new in Anki – your subjects and lectures are already here.");
      else setDraft(d);
    });

  if (platform !== "desktop") {
    return (
      <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
        <p>
          On your phone, tapping an <b>Anki</b> task opens the {platform === "android" ? "AnkiDroid" : "AnkiMobile"} app
          {platform === "ios" ? " at that deck (AnkiMobile 25.07 or newer)" : ""}.
        </p>
        <p>
          To create decks for your subjects and lectures, or import subjects from Anki, open StudyMaster on your computer with Anki running. The decks
          then reach your phone through AnkiWeb sync as usual.
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
            <Button variant="secondary" onClick={createDecks} disabled={!!busy || subjects.length === 0}>
              {busy === "create" ? <Loader2 size={16} className="animate-spin" /> : <FolderPlus size={16} />} Create my decks in Anki
            </Button>
            <Button variant="secondary" onClick={importDecks} disabled={!!busy}>
              {busy === "import" ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />} Import subjects from Anki
            </Button>
            <Button variant="ghost" onClick={() => setConnected(false)}>
              <Unplug size={16} /> Disconnect
            </Button>
          </>
        ) : (
          <>
            <Button onClick={connect} disabled={!!busy}>
              {busy === "connect" ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Connect Anki
            </Button>
            <Button variant="ghost" onClick={() => window.open(ANKIWEB_DECKS_URL, "_blank", "noopener")}>
              <ExternalLink size={16} /> Use AnkiWeb instead
            </Button>
          </>
        )}
      </div>
      <p className="text-xs text-slate-500">
        Decks are named <span className="font-mono">Subject::Lecture</span>. Tapping an Anki task opens that subject's deck in Anki.
      </p>
      <ImportDialog open={!!draft} initialDraft={draft ?? undefined} onClose={() => setDraft(null)} />
    </div>
  );
}
