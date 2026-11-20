import type { BlockReason, BlockedRange, Half, SessionCount, Settings } from "@studymaster/core";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { formatShort, newId, todayISO, WEEKDAYS } from "../lib/format";
import { useStore } from "../store";
import { Button, Field, NumberInput, Segmented, Select, TextInput, Toggle } from "./ui";

const COUNTS: SessionCount[] = [1, 2, 3, 4];
const COUNT_HINT: Record<SessionCount, string> = {
  1: "1 morning",
  2: "1 morning + 1 afternoon",
  3: "2 morning + 1 afternoon",
  4: "2 morning + 2 afternoon",
};

export function RhythmSettings() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);

  return (
    <div className="space-y-5">
      <Field label="Sessions per day" hint={COUNT_HINT[s.preferredSessionsPerDay]}>
        <Segmented
          value={s.preferredSessionsPerDay}
          onChange={(v) => update({ preferredSessionsPerDay: v, maxSessionsPerDay: Math.max(v, s.maxSessionsPerDay) as SessionCount })}
          options={COUNTS.map((c) => ({ value: c, label: String(c), hint: COUNT_HINT[c] }))}
        />
      </Field>
      <Field label="Most sessions I'd accept on a busy day" hint="Only used if you fall behind, and only after you agree.">
        <Segmented
          value={s.maxSessionsPerDay}
          onChange={(v) => update({ maxSessionsPerDay: Math.max(v, s.preferredSessionsPerDay) as SessionCount })}
          options={COUNTS.map((c) => ({ value: c, label: String(c) }))}
        />
      </Field>
      <Field label={`Session length: ${Math.floor(s.sessionMinutes / 60)} h ${s.sessionMinutes % 60 ? `${s.sessionMinutes % 60} min` : ""}`}>
        <input
          type="range"
          min={120}
          max={180}
          step={15}
          value={s.sessionMinutes}
          onChange={(e) => update({ sessionMinutes: Number(e.target.value) })}
          className="w-full accent-indigo-600"
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Max chunks per session">
          <NumberInput min={1} max={6} value={s.maxChunksPerSession} onChange={(v) => update({ maxChunksPerSession: Math.max(1, Math.round(v)) })} />
        </Field>
        <Field label="Max pages per chunk" hint="Bigger chapters get split.">
          <NumberInput min={5} max={200} value={s.maxPagesPerChunk} onChange={(v) => update({ maxPagesPerChunk: Math.max(5, Math.round(v)) })} />
        </Field>
        <Field label="Max slides per chunk">
          <NumberInput min={10} max={400} value={s.maxSlidesPerChunk} onChange={(v) => update({ maxSlidesPerChunk: Math.max(10, Math.round(v)) })} />
        </Field>
      </div>
      <Field
        label="Pace"
        hint={
          s.pacing === "even"
            ? "Work is spread steadily until each exam's finish date, so Anki keeps running."
            : "Material is finished as early as possible; after that only reviews."
        }
      >
        <Segmented
          value={s.pacing}
          onChange={(pacing) => update({ pacing })}
          options={[
            { value: "even", label: "Steady" },
            { value: "early", label: "Finish early" },
          ]}
        />
      </Field>
      <Field label="Finish main study before each exam" hint="The last days before an exam are for review only.">
        <Segmented
          value={s.examBufferDays}
          onChange={(v) => update({ examBufferDays: v })}
          options={[0, 1, 2, 3, 4].map((d) => ({ value: d, label: d === 0 ? "same day" : `${d} day${d > 1 ? "s" : ""}` }))}
        />
      </Field>
    </div>
  );
}

export function BufferSettings() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);
  const wb = s.weeklyBuffer;
  const fixed = wb.when !== "auto";

  return (
    <div className="space-y-4">
      <Toggle
        checked={wb.enabled}
        onChange={(enabled) => update({ weeklyBuffer: { ...wb, enabled } })}
        label="Keep one half-day per week free"
        hint="A catch-up reserve. It stays empty unless you fall behind, and the app asks before using it."
      />
      {wb.enabled && (
        <>
          <Segmented
            value={fixed ? "fixed" : "auto"}
            onChange={(v) => update({ weeklyBuffer: { ...wb, when: v === "auto" ? "auto" : { weekday: 0, half: "pm" } } })}
            options={[
              { value: "auto", label: "Pick automatically" },
              { value: "fixed", label: "Fixed time" },
            ]}
          />
          {wb.when !== "auto" && (
            <div className="grid grid-cols-2 gap-3">
              <Select
                value={String(wb.when.weekday)}
                onChange={(v) => update({ weeklyBuffer: { ...wb, when: { ...(wb.when as { weekday: number; half: Half }), weekday: Number(v) } } })}
                options={[1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: WEEKDAYS[d]! }))}
              />
              <Segmented
                value={wb.when.half}
                onChange={(half) => update({ weeklyBuffer: { ...wb, when: { ...(wb.when as { weekday: number; half: Half }), half } } })}
                options={[
                  { value: "am", label: "Morning" },
                  { value: "pm", label: "Afternoon" },
                ]}
              />
            </div>
          )}
        </>
      )}
    </div>
  );
}

export function AnkiSettingsForm() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);
  const a = s.anki;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Anki at the start of every session (min)">
        <NumberInput min={0} max={60} value={a.minMinutesPerSession} onChange={(v) => update({ anki: { ...a, minMinutesPerSession: v } })} />
      </Field>
      <Field label="Anki can take up to (% of a session)">
        <NumberInput min={10} max={60} value={Math.round(a.maxShareOfSession * 100)} onChange={(v) => update({ anki: { ...a, maxShareOfSession: v / 100 } })} />
      </Field>
      <Field label="Seconds per review">
        <NumberInput min={2} max={60} value={a.secondsPerReview} onChange={(v) => update({ anki: { ...a, secondsPerReview: v } })} />
      </Field>
      <Field label="Share of cards due per day (%)" hint="10% is typical for a growing collection.">
        <NumberInput min={1} max={50} value={Math.round(a.dueFractionPerDay * 100)} onChange={(v) => update({ anki: { ...a, dueFractionPerDay: v / 100 } })} />
      </Field>
    </div>
  );
}

export function RateSettings() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);
  const r = s.rates;
  const row = (label: string, key: keyof Settings["rates"], step = 0.5) => (
    <Field label={label}>
      <NumberInput min={0} max={30} step={step} value={r[key]} onChange={(v) => update({ rates: { ...r, [key]: v } })} />
    </Field>
  );
  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
      {row("Reading min / page", "readPerPage")}
      {row("Reading min / slide", "readPerSlide")}
      {row("Summary min / page", "summaryPerPage")}
      {row("Summary min / slide", "summaryPerSlide")}
      {row("Cards per page", "cardsPerPage", 0.1)}
      {row("Cards per slide", "cardsPerSlide", 0.1)}
      {row("Min per new card", "minutesPerCard")}
    </div>
  );
}

const REASONS: { value: BlockReason; label: string }[] = [
  { value: "vacation", label: "🌴 Vacation" },
  { value: "break", label: "☕ Study break" },
  { value: "sick", label: "🤒 Sick" },
  { value: "other", label: "📅 Other" },
];

export function DaysOffEditor() {
  const blocked = useStore((x) => x.blocked);
  const upsert = useStore((x) => x.upsertBlocked);
  const remove = useStore((x) => x.removeBlocked);
  const [draft, setDraft] = useState<BlockedRange>(() => ({ id: newId(), start: todayISO(), end: todayISO(), reason: "vacation" }));

  const add = () => {
    upsert({ ...draft, end: draft.end < draft.start ? draft.start : draft.end, note: draft.note?.trim() || undefined });
    setDraft({ id: newId(), start: draft.start, end: draft.start, reason: draft.reason });
  };

  return (
    <div className="space-y-4">
      {blocked.length > 0 && (
        <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
          {blocked.map((b) => (
            <li key={b.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span>{REASONS.find((r) => r.value === b.reason)?.label.split(" ")[0]}</span>
              <span className="flex-1">
                <span className="font-medium">{b.start === b.end ? formatShort(b.start) : `${formatShort(b.start)} – ${formatShort(b.end)}`}</span>
                {b.note && <span className="text-slate-500"> · {b.note}</span>}
              </span>
              <button onClick={() => remove(b.id)} className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10" aria-label="Remove">
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2 dark:bg-slate-800/40">
        <Field label="From">
          <TextInput type="date" value={draft.start} onChange={(e) => e.target.value && setDraft({ ...draft, start: e.target.value, end: draft.end < e.target.value ? e.target.value : draft.end })} />
        </Field>
        <Field label="To">
          <TextInput type="date" value={draft.end} min={draft.start} onChange={(e) => e.target.value && setDraft({ ...draft, end: e.target.value })} />
        </Field>
        <Field label="Reason">
          <Select value={draft.reason} onChange={(reason) => setDraft({ ...draft, reason })} options={REASONS} />
        </Field>
        <Field label="Note (optional)">
          <TextInput value={draft.note ?? ""} placeholder="e.g. Ski trip" onChange={(e) => setDraft({ ...draft, note: e.target.value })} />
        </Field>
        <Button className="sm:col-span-2" variant="secondary" onClick={add}>
          <Plus size={16} /> Add days off
        </Button>
      </div>
    </div>
  );
}
