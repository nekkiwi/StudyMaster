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
import { Button, cx, Field, NumberInput, Segmented, Select, TextInput, Toggle } from "./ui";

const COUNTS: SessionCount[] = [1, 2, 3, 4];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Monday first

const PRESETS: { label: string; detail: string; week: () => WeekPlan }[] = [
  {
    label: "Weekday afternoons + weekend mornings",
    detail: "Mornings for lectures, half the weekend free",
    week: () => DEFAULT_WEEK.map((d) => ({ ...d })) as WeekPlan,
  },
  {
    label: "Weekday afternoons only",
    detail: "Weekends stay completely free",
    week: () => DEFAULT_WEEK.map((d, i) => (i === 0 || i === 6 ? { am: 0, pm: 0 } : { ...d })) as WeekPlan,
  },
  { label: "Every day, morning + afternoon", detail: "Exam season: full days", week: () => everyDay(1, 1) },
];

const sameWeek = (a: WeekPlan, b: WeekPlan) => a.every((d, i) => d.am === b[i]!.am && d.pm === b[i]!.pm);

/** Mon–Sun as columns, morning/afternoon as rows; 0/1/2 sessions in each cell. */
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
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {PRESETS.map((p) => {
          const week = p.week();
          const active = sameWeek(week, s.week);
          const n = week.reduce((a, d) => a + d.am + d.pm, 0);
          return (
            <button
              key={p.label}
              type="button"
              aria-pressed={active}
              onClick={() => update({ week })}
              className={cx(
                "rounded-2xl border-2 px-3 py-2.5 text-left transition sm:py-3",
                active
                  ? "border-indigo-500 bg-indigo-50 dark:border-indigo-400 dark:bg-indigo-500/10"
                  : "border-slate-200 hover:border-indigo-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60",
              )}
            >
              <span className="block text-sm font-semibold leading-snug sm:text-base">{p.label}</span>
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                {p.detail} · {n} sessions
              </span>
            </button>
          );
        })}
      </div>

      <p className="text-xs text-slate-500 sm:hidden">Swipe sideways to see the whole week →</p>
      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[34rem] grid-cols-[4.5rem_repeat(7,minmax(0,1fr))] items-center gap-1.5">
          <span className="sticky left-0 z-10 self-stretch bg-white dark:bg-slate-900" />
          {WEEK_ORDER.map((d) => (
            <span key={d} className={cx("text-center text-sm font-semibold", (d === 0 || d === 6) && "text-indigo-600 dark:text-indigo-400")}>
              {WEEKDAYS[d]!.slice(0, 3)}
            </span>
          ))}
          {(["am", "pm"] as const).map((half) => (
            <Fragment key={half}>
              <span className="sticky left-0 z-10 flex self-stretch items-center bg-white pr-1 text-xs font-medium text-slate-500 dark:bg-slate-900">
                {half === "am" ? "Morning" : "Afternoon"}
              </span>
              {WEEK_ORDER.map((d) => (
                <CellPicker key={d} label={`${WEEKDAYS[d]} ${half === "am" ? "morning" : "afternoon"}`} value={s.week[d]![half]} onChange={(v) => setDay(d, half, v)} />
              ))}
            </Fragment>
          ))}
        </div>
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400">
        {perWeek} session{perWeek === 1 ? "" : "s"} a week ≈ {Math.round((perWeek * s.sessionMinutes) / 60)} h. – = free, 1 or 2 = sessions in that
        half-day. Free half-days stay free.
      </p>
    </div>
  );
}

/** – / 1 / 2 side by side for one half-day. */
function CellPicker({ label, value, onChange }: { label: string; value: HalfDaySessions; onChange: (v: HalfDaySessions) => void }) {
  return (
    <div role="radiogroup" aria-label={label} className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800">
      {([0, 1, 2] as const).map((v) => {
        const on = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${label}: ${v === 0 ? "free" : `${v} session${v > 1 ? "s" : ""}`}`}
            onClick={() => onChange(v)}
            className={cx(
              "h-9 flex-1 rounded-lg text-sm font-semibold tabular-nums transition",
              on
                ? v === 0
                  ? "bg-white text-slate-700 shadow-sm dark:bg-slate-600 dark:text-white"
                  : v === 1
                    ? "bg-indigo-500 text-white shadow-sm"
                    : "bg-indigo-700 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-700 dark:hover:text-slate-200",
            )}
          >
            {v === 0 ? "–" : v}
          </button>
        );
      })}
    </div>
  );
}

export function RhythmSettings({ week = true }: { week?: boolean }) {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);

  return (
    <div className="space-y-5">
      {week && <WeekGrid />}
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

/** Settings only: how long material is cut into session-sized pieces. */
export function SplittingSettings() {
  const s = useStore((x) => x.settings);
  const update = useStore((x) => x.updateSettings);
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600 dark:text-slate-400">
        Each lecture, book chapter or slide deck is one <b>item</b> in your plan. Long items are cut into parts that fit one session – e.g. a
        60-page chapter becomes “Chapter 4 (1/3)”, “(2/3)” and “(3/3)” on different days. These limits decide where that happens.
      </p>
      <Field label="Different items per session" hint="How many lectures or chapters one session may mix. 1 = always one thing at a time.">
        <NumberInput className="w-28" min={1} max={6} value={s.maxChunksPerSession} onChange={(v) => update({ maxChunksPerSession: Math.max(1, Math.round(v)) })} />
      </Field>
      <Field label="Split chapters longer than … pages" hint={`A ${s.maxPagesPerChunk * 2}-page chapter becomes 2 parts.`}>
        <NumberInput className="w-28" min={5} max={200} value={s.maxPagesPerChunk} onChange={(v) => update({ maxPagesPerChunk: Math.max(5, Math.round(v)) })} />
      </Field>
      <Field label="Split slide decks longer than … slides" hint={`A ${s.maxSlidesPerChunk * 2}-slide deck becomes 2 parts.`}>
        <NumberInput className="w-28" min={10} max={400} value={s.maxSlidesPerChunk} onChange={(v) => update({ maxSlidesPerChunk: Math.max(10, Math.round(v)) })} />
      </Field>
      <p className="text-xs text-slate-500">Anything that doesn't fit into one session is split anyway, whatever these numbers say.</p>
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
