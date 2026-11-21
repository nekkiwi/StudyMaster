import { addDays, daysBetween, eachDay, weekKey, fromDayNumber, sessionMinutes, type ISODate, type Subject } from "@studymaster/core";
import { ChevronLeft, ChevronRight, GraduationCap, Layers, Palmtree } from "lucide-react";
import { useMemo, useState } from "react";
import { ProposalBanner } from "../components/proposal";
import { KIND_ICON, SessionCard } from "../components/session";
import { Badge, Button, Card, cx, Modal, SectionTitle, SubjectDot } from "../components/ui";
import { toClock } from "../lib/calendar";
import { dayBackground, subjectColor } from "../lib/colors";
import { formatDay, formatMinutes, formatShort, SLOT_LABEL, weekdayShort } from "../lib/format";
import { daySubjects } from "../lib/stats";
import type { Planner } from "../planner";
import { useStore } from "../store";

// Stable empty defaults: a new [] / {} in a store selector re-renders forever.
const NO_LIST: never[] = [];
const NO_MAP: Record<string, never> = {};

const BLOCK_LABEL = { vacation: "Vacation", sick: "Sick", break: "Break", other: "Off" };

export function PlanView({ planner }: { planner: Planner }) {
  const { today, shown, state } = planner;
  const [weekStart, setWeekStart] = useState<ISODate>(fromDayNumber(weekKey(today)));
  const [openDay, setOpenDay] = useState<ISODate | null>(null);
  const subjects = useMemo(() => new Map(state.subjects.map((s) => [s.id, s])), [state.subjects]);
  const days = eachDay(weekStart, addDays(weekStart, 6));

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Plan</h1>
          <p className="text-slate-500 dark:text-slate-400">
            {formatShort(weekStart)} – {formatShort(addDays(weekStart, 6))}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Previous week">
            <ChevronLeft size={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekStart(fromDayNumber(weekKey(today)))}>
            This week
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Next week">
            <ChevronRight size={16} />
          </Button>
        </div>
      </header>

      <ProposalBanner planner={planner} />

      {/* The week is the main view; the overview of all weeks comes below. */}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-7">
        {days.map((d) => (
          <DayColumn key={d} date={d} planner={planner} subjects={subjects} onOpen={() => setOpenDay(d)} />
        ))}
      </div>

      <Legend subjects={state.subjects} />

      <Overview
        planner={planner}
        onPickWeek={(d) => {
          setWeekStart(fromDayNumber(weekKey(d)));
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
        weekStart={weekStart}
      />

      <Modal open={!!openDay} onClose={() => setOpenDay(null)} title={openDay ? formatDay(openDay) : ""}>
        {openDay && (
          <div className="space-y-3">
            {shown.plan.sessions
              .filter((s) => s.date === openDay)
              .map((s) => (
                <SessionCard key={s.slot} session={s} subjects={subjects} />
              ))}
            {shown.plan.sessions.every((s) => s.date !== openDay) && (
              <p className="text-sm text-slate-500">Nothing planned on this day.</p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}

function DayColumn({
  date,
  planner,
  subjects,
  onOpen,
}: {
  date: ISODate;
  planner: Planner;
  subjects: Map<string, Subject>;
  onOpen: () => void;
}) {
  const checkIns = useStore((s) => s.checkIns);
  const calendars = (useStore((s) => s.calendars) ?? NO_LIST);
  const calendarEvents = (useStore((s) => s.calendarEvents) ?? NO_MAP);
  const slotTimes = useStore((s) => s.settings.slotTimes);
  const { today, shown, state } = planner;
  // Classes etc. from calendars that block study time, in time order.
  const classes = calendars
    .filter((c) => c.block)
    .flatMap((c) => (calendarEvents[c.id] ?? []).filter((e) => e.date === date))
    .sort((a, b) => a.start - b.start);
  const sessions = shown.plan.sessions.filter((s) => s.date === date);
  const buffer = shown.plan.bufferSlots.filter((s) => s.date === date);
  const exams = state.subjects.filter((s) => s.examDate === date);
  const block = state.blocked.find((b) => b.start <= date && b.end >= date);
  const record = checkIns[date];
  const isToday = date === today;
  const past = date < planner.from;
  const total = sessions.reduce((a, s) => a + sessionMinutes(s), 0);
  // The day takes the colors of the subjects studied: one tint, or diagonal splits.
  const colors = daySubjects(shown.plan, date).filter((id) => subjects.has(id)).map((id) => subjectColor(subjects.get(id)));
  const background = block ? undefined : dayBackground(colors, 30);

  return (
    <button
      type="button"
      onClick={onOpen}
      style={background ? { backgroundImage: background } : undefined}
      className={cx(
        "flex flex-col rounded-2xl border p-3 text-left transition hover:shadow-md md:min-h-64",
        isToday
          ? "border-indigo-300 bg-white ring-2 ring-indigo-500/15 dark:border-indigo-500/50 dark:bg-slate-900"
          : "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900",
        block && "bg-slate-100/70 dark:bg-slate-900/40",
        past && "opacity-60",
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 md:block">
        <p className={cx("text-sm font-semibold whitespace-nowrap", isToday && "text-indigo-600 dark:text-indigo-400")}>
          {weekdayShort(date)} <span className="font-normal text-slate-500">{formatShort(date)}</span>
        </p>
        <p className="text-[11px] text-slate-400 tabular-nums md:h-4">{total > 0 ? formatMinutes(total) : ""}</p>
      </div>

      <div className="flex flex-1 flex-col gap-1.5">
        {exams.map((s) => (
          <div key={s.id} className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-medium text-white">
            <GraduationCap size={13} /> {s.name} exam
          </div>
        ))}
        {block && (
          <div className="flex items-center gap-1.5 rounded-lg bg-slate-200 px-2 py-1 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Palmtree size={13} /> {block.note || BLOCK_LABEL[block.reason]}
          </div>
        )}
        {record && (
          <Badge tone={record.answer === "yes" ? "emerald" : "rose"} className="self-start">
            {record.answer === "yes" ? "✓ Done" : "Partly / missed"}
          </Badge>
        )}

        {/* Sessions and classes in time order. */}
        {[
          ...sessions.map((s) => ({ start: slotTimes[s.slot].start, node: (

          <div
            key={s.slot}
            className={cx(
              "rounded-lg border px-2 py-1.5",
              s.kind === "buffer" && "buffer-stripes border-amber-300/70",
              s.kind === "extra" && "border-rose-200 dark:border-rose-500/30",
              s.kind === "normal" && "border-white/60 bg-white/55 dark:border-slate-700/50 dark:bg-slate-900/45",
            )}
          >
            <p className="text-[10px] font-medium tracking-wide text-slate-400 uppercase">
              {SLOT_LABEL[s.slot]}
              {s.kind === "extra" && " · extra"}
            </p>
            {s.items.map((i) => {
              if (i.kind === "anki") {
                return (
                  <p key={i.chunkId} className="flex items-center gap-1.5 truncate text-xs text-sky-700 dark:text-sky-300">
                    <Layers size={11} className="shrink-0" /> <span className="truncate">Anki {i.minutes}′</span>
                  </p>
                );
              }
              const Icon = KIND_ICON[i.kind];
              return (
                <p key={`${i.chunkId}-${i.part}`} className="flex items-center gap-1.5 truncate text-xs">
                  <Icon size={11} className="shrink-0" style={{ color: subjects.get(i.subjectId)?.color }} />
                  <span className="truncate">{i.title}</span>
                </p>
              );
            })}
            {s.type === "review" && (
              <p className="flex items-center gap-1.5 text-xs font-medium">
                <SubjectDot color={subjects.get(s.reviewSubjectId!)?.color} className="h-2 w-2" /> Review {subjects.get(s.reviewSubjectId!)?.name}
              </p>
            )}
          </div>
        
          ) })),
          ...classes.map((e, i) => ({
            start: e.start,
            node: (
              <div key={`class-${i}`} className="truncate rounded-lg bg-slate-200/70 px-2 py-1 text-[11px] text-slate-600 dark:bg-slate-800 dark:text-slate-300" title={`${toClock(e.start)}–${toClock(e.end)} ${e.title}`}>
                <span className="font-medium tabular-nums">{toClock(e.start)}</span> {e.title}
              </div>
            ),
          })),
        ]
          .sort((x, y) => x.start - y.start)
          .map((x) => x.node)}

        {sessions.length === 0 && buffer.length === 0 && exams.length === 0 && !block && !record && classes.length === 0 && (
          <p className="text-xs text-slate-400">{past ? "" : "Free"}</p>
        )}
        {buffer.length > 0 && (
          <div className="buffer-stripes rounded-lg border border-dashed border-amber-300 px-2 py-1.5 text-[11px] font-medium text-amber-700 dark:border-amber-500/40 dark:text-amber-300">
            Buffer · free
          </div>
        )}
      </div>
    </button>
  );
}

/** A heat strip from today to the last exam: how busy each day is. */
function Overview({ planner, onPickWeek, weekStart }: { planner: Planner; onPickWeek: (d: ISODate) => void; weekStart: ISODate }) {
  const { today, shown, state } = planner;
  const last = state.subjects.map((s) => s.examDate).sort().pop();
  if (!last || last < today) return null;

  const days = eachDay(fromDayNumber(weekKey(today)), last);
  const weeks = [...new Set(days.map((d) => fromDayNumber(weekKey(d))))];
  const max = state.settings.sessionMinutes * state.settings.maxSessionsPerDay;
  const load = new Map<ISODate, number>();
  for (const s of shown.plan.sessions) load.set(s.date, (load.get(s.date) ?? 0) + sessionMinutes(s));
  const exams = new Map(state.subjects.map((s) => [s.examDate, s]));

  const upcoming = state.subjects.filter((s) => s.examDate >= today).sort((a, b) => a.examDate.localeCompare(b.examDate));
  const subjects = new Map(state.subjects.map((s) => [s.id, s]));
  const status = new Map(shown.plan.subjects.map((s) => [s.subjectId, s]));

  return (
    <Card>
      <SectionTitle action={<span className="text-xs text-slate-400">{daysBetween(today, last)} days to the last exam</span>}>
        Overview
      </SectionTitle>
      <div className="flex flex-col gap-6 md:flex-row md:items-start">
        {weeks.length <= 6 ? (
        <div className="grid w-full max-w-sm grid-cols-7 gap-1.5 self-center md:self-start">
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
            <span key={i} className="text-center text-[10px] text-slate-400">{d}</span>
          ))}
          {days.map((d) => {
            const minutes = load.get(d) ?? 0;
            const exam = exams.get(d);
            const blocked = state.blocked.some((b) => b.start <= d && b.end >= d);
            const inWeek = d >= weekStart && d <= addDays(weekStart, 6);
            const level = minutes === 0 ? 0 : Math.min(4, Math.ceil((minutes / max) * 4));
            // Subject colors of the day; busier days a little stronger.
            const colors = daySubjects(shown.plan, d).filter((id) => subjects.has(id)).map((id) => subjectColor(subjects.get(id)));
            const background = !exam && !blocked && minutes > 0 ? dayBackground(colors, 30 + level * 12) : undefined;
            return (
              <button
                key={d}
                type="button"
                onClick={() => onPickWeek(d)}
                title={`${formatDay(d)}${minutes ? ` · ${formatMinutes(minutes)}` : ""}${colors.length ? ` · ${daySubjects(shown.plan, d).map((id) => subjects.get(id)?.name).join(" + ")}` : ""}${exam ? ` · ${exam.name} exam` : ""}`}
                className={cx(
                  "relative aspect-square rounded-md transition hover:scale-110",
                  d < today && "opacity-40",
                  inWeek && "outline-2 outline-offset-1 outline-indigo-500",
                  blocked ? "bg-slate-200 dark:bg-slate-700" : "bg-slate-100 dark:bg-slate-800",
                )}
                style={exam ? { background: exam.color } : background ? { backgroundImage: background } : undefined}
              >
                {exam && (
                  <span className="absolute inset-0 flex items-center justify-center text-white">
                    <GraduationCap size={14} />
                  </span>
                )}
                {d === today && <span className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full border-2 border-white bg-rose-500 dark:border-slate-900" />}
              </button>
            );
          })}
        </div>
        ) : (
          <CompactCalendar
            weeks={weeks}
            today={today}
            weekStart={weekStart}
            onPickWeek={onPickWeek}
            cell={(d) => {
              const minutes = load.get(d) ?? 0;
              const exam = exams.get(d);
              const blocked = state.blocked.some((b) => b.start <= d && b.end >= d);
              const level = minutes === 0 ? 0 : Math.min(4, Math.ceil((minutes / max) * 4));
              const colors = daySubjects(shown.plan, d).filter((id) => subjects.has(id)).map((id) => subjectColor(subjects.get(id)));
              return {
                exam: !!exam,
                title: `${formatDay(d)}${minutes ? ` · ${formatMinutes(minutes)}` : ""}${exam ? ` · ${exam.name} exam` : ""}`,
                style: exam
                  ? { background: subjectColor(exam) }
                  : !blocked && minutes > 0
                    ? { backgroundImage: dayBackground(colors, 35 + level * 12) }
                    : undefined,
                className: blocked ? "bg-slate-300 dark:bg-slate-600" : "bg-slate-100 dark:bg-slate-800",
              };
            }}
          />
        )}
        <ul className="flex-1 space-y-3">
          {upcoming.map((s) => {
            const st = status.get(s.id);
            return (
              <li key={s.id} className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ background: s.color }}>
                  <GraduationCap size={16} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{s.name}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Exam {formatDay(s.examDate)}
                    {st?.lastStudyDate && ` · main study done ${formatShort(st.lastStudyDate)}`}
                  </p>
                </div>
                {st && st.deficitMinutes > 0 ? <Badge tone="rose">{formatMinutes(st.deficitMinutes)} short</Badge> : <Badge tone="emerald">on track</Badge>}
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

function Legend({ subjects }: { subjects: Subject[] }) {
  const [a, b] = subjects;
  const split = a && b ? dayBackground([subjectColor(a), subjectColor(b)], 45) : undefined;
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-slate-500 dark:text-slate-400">
      {subjects.map((s) => (
        <span key={s.id} className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ backgroundImage: dayBackground([subjectColor(s)], 45) }} /> {s.name}
        </span>
      ))}
      {split && (
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded" style={{ backgroundImage: split }} /> Two subjects that day
        </span>
      )}
      <span className="flex items-center gap-1.5"><span className="buffer-stripes h-3 w-3 rounded ring-1 ring-amber-300" /> Weekly buffer (catch-up)</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded ring-1 ring-rose-300" /> Extra session</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-slate-200 dark:bg-slate-700" /> Day off</span>
      <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded bg-indigo-600" /> Exam</span>
    </div>
  );
}

/**
 * Many weeks: one narrow column per week (Mon–Sun top to bottom), month
 * labels on top – like a year calendar. Scrolls sideways when needed.
 */
function CompactCalendar({
  weeks,
  today,
  weekStart,
  onPickWeek,
  cell,
}: {
  weeks: ISODate[];
  today: ISODate;
  weekStart: ISODate;
  onPickWeek: (d: ISODate) => void;
  cell: (d: ISODate) => { title: string; style?: React.CSSProperties; className: string; exam: boolean };
}) {
  const monthOf = (d: ISODate) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short" });
  return (
    <div className="w-full min-w-0 md:max-w-xl">
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-1">
          <div className="flex shrink-0 flex-col gap-1 pr-1 pt-5 text-[9px] leading-[14px] text-slate-400">
            {["M", "", "W", "", "F", "", "S"].map((l, i) => (
              <span key={i} className="h-3.5">{l}</span>
            ))}
          </div>
          {weeks.map((w, i) => {
            const newMonth = i === 0 || monthOf(w) !== monthOf(weeks[i - 1]!);
            const inWeek = w === weekStart;
            return (
              <button
                key={w}
                type="button"
                onClick={() => onPickWeek(w)}
                aria-label={`Week of ${formatShort(w)}`}
                className={cx("flex shrink-0 flex-col gap-1 rounded-md p-0.5 transition hover:bg-slate-100 dark:hover:bg-slate-800", inWeek && "ring-2 ring-indigo-500")}
              >
                <span className="h-4 text-left text-[10px] font-medium whitespace-nowrap text-slate-500">{newMonth ? monthOf(w) : ""}</span>
                {eachDay(w, addDays(w, 6)).map((d) => {
                  const c = cell(d);
                  return (
                    <span key={d} title={c.title} style={c.style} className={cx("relative block h-3.5 w-3.5 rounded-[3px]", c.className, d < today && "opacity-40")}>
                      {d === today && <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-rose-500" />}
                    </span>
                  );
                })}
              </button>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-slate-400">Tap a week to show it above.</p>
    </div>
  );
}
