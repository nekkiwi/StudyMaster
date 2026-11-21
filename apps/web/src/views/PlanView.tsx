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
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-7">
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
        "flex min-w-0 flex-col rounded-2xl border p-3 text-left transition hover:shadow-md lg:min-h-64",
        isToday
          ? "border-indigo-300 bg-white ring-2 ring-indigo-500/15 dark:border-indigo-500/50 dark:bg-slate-900"
          : "border-slate-200/80 bg-white dark:border-slate-800 dark:bg-slate-900",
        block && "bg-slate-100/70 dark:bg-slate-900/40",
        past && "opacity-60",
      )}
    >
      <div className="mb-2 flex items-baseline justify-between gap-2 lg:block">
        <p className={cx("text-sm font-semibold whitespace-nowrap", isToday && "text-indigo-600 dark:text-indigo-400")}>
          {weekdayShort(date)} <span className="font-normal text-slate-500">{formatShort(date)}</span>
        </p>
        <p className="text-[11px] text-slate-400 tabular-nums lg:h-4">{total > 0 ? formatMinutes(total) : ""}</p>
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

/**
 * Overview: one timeline row per subject, all on the same scale from this
 * week to the last exam. Study days are bars in the subject's color (taller
 * = more time), reviews dark, a dashed line marks "main study done by", the
 * cap marks the exam. Tap a row to show that week above.
 */
function Overview({ planner, onPickWeek, weekStart }: { planner: Planner; onPickWeek: (d: ISODate) => void; weekStart: ISODate }) {
  const { today, shown, state } = planner;
  const upcoming = state.subjects.filter((s) => s.examDate >= today).sort((a, b) => a.examDate.localeCompare(b.examDate));
  const last = upcoming[upcoming.length - 1]?.examDate;
  if (!last) return null;

  const start = fromDayNumber(weekKey(today));
  const total = daysBetween(start, last) + 1;
  const x = (d: ISODate) => (daysBetween(start, d) / total) * 100;
  const width = Math.max(100 / total, 0.35);
  const status = new Map(shown.plan.subjects.map((s) => [s.subjectId, s]));

  // Minutes per subject and day (study work), and review days.
  const work = new Map<string, Map<ISODate, number>>();
  const reviews = new Map<string, Set<ISODate>>();
  for (const session of shown.plan.sessions) {
    if (session.type === "review" && session.reviewSubjectId) {
      let set = reviews.get(session.reviewSubjectId);
      if (!set) reviews.set(session.reviewSubjectId, (set = new Set()));
      set.add(session.date);
    }
    for (const item of session.items) {
      if (item.kind === "anki") continue;
      let m = work.get(item.subjectId);
      if (!m) work.set(item.subjectId, (m = new Map()));
      m.set(session.date, (m.get(session.date) ?? 0) + item.minutes);
    }
  }
  const dayMax = Math.max(60, ...[...work.values()].flatMap((m) => [...m.values()]));

  // Month labels on the axis.
  const months: { label: string; at: number }[] = [];
  for (const d of eachDay(start, last)) {
    if (d === start || d.endsWith("-01")) {
      months.push({ label: new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short" }), at: x(d) });
    }
  }
  const pick = (e: React.MouseEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const day = Math.min(total - 1, Math.max(0, Math.floor(((e.clientX - r.left) / r.width) * total)));
    onPickWeek(addDays(start, day));
  };
  const weekLeft = x(weekStart);
  const showWeek = weekStart >= start && weekStart <= last;

  return (
    <Card>
      <SectionTitle action={<span className="text-xs text-slate-400">{daysBetween(today, last)} days to the last exam</span>}>Overview</SectionTitle>
      <div className="space-y-1">
        {/* Axis: months + today */}
        <div className="flex items-end gap-3">
          <span className="hidden w-36 shrink-0 sm:block" />
          <div className="relative h-5 min-w-0 flex-1 text-[10px] font-medium text-slate-400">
            {months.map((m) => (
              <span key={`${m.label}${m.at}`} className="absolute bottom-0 border-l border-slate-200 pl-1 dark:border-slate-700" style={{ left: `${m.at}%` }}>
                {m.label}
              </span>
            ))}
          </div>
          <span className="hidden w-32 shrink-0 sm:block" />
        </div>

        {upcoming.map((subject) => {
          const color = subjectColor(subject);
          const days = work.get(subject.id) ?? new Map<ISODate, number>();
          const st = status.get(subject.id);
          const finishBy = st?.finishBy;
          return (
            <div key={subject.id} className="flex flex-col gap-1 py-1.5 sm:flex-row sm:items-center sm:gap-3">
              <div className="flex items-center justify-between gap-2 sm:w-36 sm:shrink-0">
                <span className="flex min-w-0 items-center gap-2 truncate text-sm font-medium">
                  <SubjectDot color={color} /> {subject.name}
                </span>
                <span className="sm:hidden">{st && st.deficitMinutes > 0 ? <Badge tone="rose">{formatMinutes(st.deficitMinutes)} short</Badge> : <Badge tone="emerald">on track</Badge>}</span>
              </div>
              <button
                type="button"
                onClick={pick}
                aria-label={`${subject.name}: show a week`}
                title={`${subject.name} · exam ${formatDay(subject.examDate)}${finishBy ? ` · main study done by ${formatShort(finishBy)}` : ""}`}
                className="relative h-9 w-full shrink-0 rounded-lg bg-slate-50 sm:w-auto sm:min-w-0 sm:flex-1 sm:shrink dark:bg-slate-800/40"
              >
                {/* until the exam */}
                <span className="absolute inset-y-0 left-0 rounded-lg" style={{ width: `${x(subject.examDate) + width}%`, background: `${color}14` }} />
                {showWeek && <span className="absolute inset-y-0 bg-indigo-500/10 ring-1 ring-indigo-400/40" style={{ left: `${weekLeft}%`, width: `${(7 / total) * 100}%` }} />}
                {[...days].map(([d, minutes]) => (
                  <span
                    key={d}
                    className="absolute bottom-1 rounded-sm"
                    style={{ left: `${x(d)}%`, width: `${width}%`, height: `${20 + (minutes / dayMax) * 65}%`, background: color, opacity: d < today ? 0.35 : 0.85 }}
                  />
                ))}
                {[...(reviews.get(subject.id) ?? [])].map((d) => (
                  <span key={`r${d}`} className="absolute bottom-1 h-[70%] rounded-sm bg-slate-700 dark:bg-slate-300" style={{ left: `${x(d)}%`, width: `${width}%` }} />
                ))}
                {finishBy && finishBy >= start && (
                  <span className="absolute inset-y-1 border-l-2 border-dashed" style={{ left: `${x(finishBy)}%`, borderColor: color }} />
                )}
                <span
                  className="absolute top-1/2 flex h-6 w-6 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-white shadow-sm"
                  style={{ left: `${x(subject.examDate) + width / 2}%`, background: color }}
                >
                  <GraduationCap size={13} />
                </span>
                <span className="absolute inset-y-0 w-0.5 bg-rose-500" style={{ left: `${x(today)}%` }} />
              </button>
              <span className="hidden w-32 shrink-0 text-right whitespace-nowrap sm:block">
                {st && st.deficitMinutes > 0 ? <Badge tone="rose">{formatMinutes(st.deficitMinutes)} short</Badge> : <Badge tone="emerald">on track</Badge>}
              </span>
            </div>
          );
        })}
        <p className="flex flex-wrap items-center gap-x-4 gap-y-1 pt-2 text-xs text-slate-400 sm:pl-[9.75rem]">
          <span className="flex items-center gap-1.5"><span className="h-3 w-1.5 rounded-sm bg-slate-400" /> study day (taller = more)</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-1.5 rounded-sm bg-slate-700 dark:bg-slate-300" /> exam review</span>
          <span className="flex items-center gap-1.5"><span className="h-3 border-l-2 border-dashed border-slate-400" /> main study done</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-0.5 bg-rose-500" /> today</span>
          <span>Tap a row to show that week.</span>
        </p>
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
