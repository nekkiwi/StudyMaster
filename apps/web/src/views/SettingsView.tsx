import { validateState, withDefaults } from "@studymaster/core";
import { Bell, ChevronDown, Download, RotateCcw, Upload } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import {
  AnkiSettingsForm,
  BufferSettings,
  DaysOffEditor,
  RateSettings,
  RhythmSettings,
  StudyStyleEditor,
  WeekGrid,
  SplittingSettings,
} from "../components/settingsForm";
import { AccountSection } from "../components/account";
import { AnkiConnectSection } from "../components/ankiConnect";
import { toast } from "../components/toast";
import { Button, Card, cx, Field, TextInput } from "../components/ui";
import { todayISO } from "../lib/format";
import { exportData, useStore, type AppData } from "../store";

function Section({ title, description, children, collapsible }: { title: string; description?: string; children: ReactNode; collapsible?: boolean }) {
  const [open, setOpen] = useState(!collapsible);
  const heading = (
    <div>
      <h2 className="font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
    </div>
  );
  return (
    <Card>
      {collapsible ? (
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className="flex w-full items-start justify-between gap-3 text-left"
        >
          {heading}
          <ChevronDown size={18} className={cx("mt-1 shrink-0 text-slate-400 transition", open && "rotate-180")} />
        </button>
      ) : (
        heading
      )}
      {open && <div className="mt-5">{children}</div>}
    </Card>
  );
}

export function SettingsView() {
  const checkInTime = useStore((s) => s.checkInTime);
  const setCheckInTime = useStore((s) => s.setCheckInTime);
  const importData = useStore((s) => s.importData);
  const reset = useStore((s) => s.reset);
  const file = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const download = () => {
    const blob = new Blob([JSON.stringify(exportData(), null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `studymaster-${todayISO()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const upload = async (f: File) => {
    try {
      const data = JSON.parse(await f.text()) as AppData;
      const errors = validateState({ subjects: data.subjects ?? [], chunks: data.chunks ?? [], blocked: data.blocked ?? [], settings: withDefaults(data.settings) });
      if (errors.length > 0) throw new Error(errors[0]);
      importData({ ...data, setupDone: true });
      toast("Backup restored.", { tone: "success" });
    } catch (e) {
      toast(`Couldn't read that file: ${e instanceof Error ? e.message : "unknown error"}`);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Settings</h1>
        <p className="text-slate-500 dark:text-slate-400">Changes update your plan right away.</p>
      </header>

      <Section title="When do you study?" description="Your normal week. Pick a preset, then adjust single half-days.">
        <WeekGrid />
      </Section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <Section title="Account" description="Sign in to keep your plan safe and in sync on all your devices.">
            <AccountSection />
          </Section>
          <Section title="How you study" description="The steps for each lecture or chapter, in your order.">
            <StudyStyleEditor />
          </Section>
          <Section title="Study rhythm" description="How much you want to study on a normal day.">
            <RhythmSettings week={false} />
          </Section>
          <Section title="Weekly buffer" description="Planned free time that doubles as a catch-up reserve.">
            <BufferSettings />
          </Section>
          <Section title="Evening check-in" description="When to ask how your day went.">
            <Field label="Remind me at" hint="Push notifications arrive with the next update. For now, the check-in waits for you on the Today screen.">
              <div className="flex items-center gap-2">
                <Bell size={16} className="text-slate-400" />
                <TextInput type="time" value={checkInTime} onChange={(e) => setCheckInTime(e.target.value)} className="w-32" />
              </div>
            </Field>
          </Section>
        </div>
        <div className="space-y-6">
          <Section title="Days off" description="Vacation, breaks, sick days: nothing gets planned on these.">
            <DaysOffEditor />
          </Section>
          <Section title="Anki" description="Open the right deck with one tap – in the Anki app or on AnkiWeb.">
            <AnkiConnectSection />
          </Section>
          <Section title="Anki timing" description="Every session ends with Anki: the new cards plus reviews." collapsible>
            <AnkiSettingsForm />
          </Section>
          <Section title="Splitting long material" description="When long chapters and slide decks are cut into parts." collapsible>
            <SplittingSettings />
          </Section>
          <Section title="Time estimates" description="Recordings, reading and writing cards. Reading and cards are scaled by the subject weight." collapsible>
            <RateSettings />
          </Section>
          <Section title="Your data" description="Download a backup file, or start from scratch.">
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={download}>
                <Download size={16} /> Export backup
              </Button>
              <Button variant="secondary" onClick={() => file.current?.click()}>
                <Upload size={16} /> Import backup
              </Button>
              <input ref={file} type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
              {confirmReset ? (
                <Button variant="danger" onClick={() => { reset(); setConfirmReset(false); }}>
                  <RotateCcw size={16} /> Yes, delete everything
                </Button>
              ) : (
                <Button variant="ghost" className="text-rose-600" onClick={() => setConfirmReset(true)}>
                  <RotateCcw size={16} /> Start over
                </Button>
              )}
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
