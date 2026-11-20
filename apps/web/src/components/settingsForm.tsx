import {
  DEFAULT_WEEK,
  everyDay,
  sessionsPerWeek,
  type BlockReason,
  type BlockedRange,
  type Half,
  type HalfDaySessions,
  type SessionCount,
  type Settings,
  type WeekPlan,
} from "@studymaster/core";
import { Plus, Trash2 } from "lucide-react";
import { Fragment, useState } from "react";
import { formatShort, newId, todayISO, WEEKDAYS } from "../lib/format";
import { useStore } from "../store";
import { Button, Field, NumberInput, Segmented, Select, TextInput, Toggle } from "./ui";

const COUNTS: SessionCount[] = [1, 2, 3, 4];
const HALF_OPTIONS = [
  { value: 0, label: "–", hint: "Free" },
  { value: 1, label: "1", hint: "1 session" },
  { value: 2, label: "2", hint: "2 sessions" },
] as const;
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

const PRESETS: { label: string; week: () => WeekPlan }[] = [
  { label: "Weekday afternoons + weekend mornings", week: () => DEFAULT_WEEK.map((d) => ({ ...d })) as WeekPlan },
  { label: "Weekday afternoons only", week: () => DEFAULT_WEEK.map((d, i) => (i === 0 || i === 6 ? { am: 0, pm: 0 } : { ...d })) as WeekPlan },
  { label: "Every day, morning + afternoon", week: () => everyDay(1, 1) },
];

/** Mon–Sun × morning/afternoon: how many sessions you normally study. */
export function WeekGrid() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);
  const setDay = (weekday: number, half: Half, value: HalfDaySessions) => {
    const week = s.week.map((d) => ({ ...d })) as WeekPlan;
    week[weekday] = { ...week[weekday]!, [half]: value };
    update({ week });
  };
  const perWeek = sessionsPerWeek(s);

  return (
    <div>
      <div className="grid grid-cols-[3.5rem_1fr_1fr] items-center gap-x-2 gap-y-1.5">
        <span />
        <span className="text-center text-xs font-medium text-slate-500">Morning</span>
        <span className="text-center text-xs font-medium text-slate-500">Afternoon</span>
        {WEEK_ORDER.map((d) => (
          <Fragment key={d}>
            <span className="text-sm font-medium">{WEEKDAYS[d]!.slice(0, 3)}</span>
            <Segmented value={s.week[d]!.am} onChange={(v) => setDay(d, "am", v)} options={[...HALF_OPTIONS]} />
            <Segmented value={s.week[d]!.pm} onChange={(v) => setDay(d, "pm", v)} options={[...HALF_OPTIONS]} />
          </Fragment>
        ))}
      </div>
      <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
        {perWeek} session{perWeek === 1 ? "" : "s"} a week ≈ {Math.round((perWeek * s.sessionMinutes) / 60)} h. Free half-days stay free.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <Button key={p.label} variant="secondary" size="sm" onClick={() => update({ week: p.week() })}>
            {p.label}
          </Button>
        ))}
      </div>
    </div>
  );
}

export function RhythmSettings() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);

  return (
    <div className="space-y-5">
      <Field label="When do you study?" hint="Up to 2 sessions per morning or afternoon." group>
        <WeekGrid />
      </Field>
      <Field label="On a busy day, at most" hint="Extra sessions are only added on days you already study, and only after you agree." group>
        <Segmented
          value={s.maxSessionsPerDay}
          onChange={(v) => update({ maxSessionsPerDay: v })}
          options={COUNTS.map((c) => ({ value: c, label: `${c} session${c > 1 ? "s" : ""}` }))}
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
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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
        group
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
      <Field label="Finish main study before each exam" hint="The last days before an exam are for review only." group>
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="Anki reviews in every session, at least (min)">
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
      <Field label="Seconds to learn a new card" hint="All its first repetitions together. Planned right after writing the cards.">
        <NumberInput min={0} max={180} value={a.secondsPerNewCard} onChange={(v) => update({ anki: { ...a, secondsPerNewCard: v } })} />
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Usual recording length (min)" hint="Pre-filled when you add lectures.">
          <NumberInput min={0} max={300} value={s.defaultRecordingMinutes} onChange={(v) => update({ defaultRecordingMinutes: Math.max(0, Math.round(v)) })} />
        </Field>
        <Field label="Watching time per video minute" hint="1 = real time · 0.8 = at 1.25× speed · 1.2 = with pauses">
          <NumberInput min={0.3} max={3} step={0.1} value={r.recordingFactor} onChange={(v) => update({ rates: { ...r, recordingFactor: Math.max(0.3, v) } })} />
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {row("Reading min / page", "readPerPage")}
        {row("Reading min / slide", "readPerSlide")}
        {row("Cards per page", "cardsPerPage", 0.1)}
        {row("Cards per slide", "cardsPerSlide", 0.1)}
        {row("Min to write a card", "minutesPerCard")}
      </div>
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
      <div className="grid grid-cols-1 gap-3 rounded-2xl bg-slate-50 p-3 sm:grid-cols-2 dark:bg-slate-800/40">
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
