import { addDays, daysBetween, isBlocked, sessionMinutes, type Subject } from "@studymaster/core";
import { CalendarCheck2, Coffee, Flame, Palmtree, PartyPopper, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { AssistantBox } from "../components/assistant";
import { CheckInCard } from "../components/checkin";
import { ProposalBanner } from "../components/proposal";
import { ReminderPrompt } from "../components/reminders";
import { SessionCard } from "../components/session";
import { Badge, Card, cx, EmptyState, ProgressRing, SectionTitle, SubjectDot } from "../components/ui";
import { toClock } from "../lib/calendar";
import { formatHours, formatLongDay, formatMinutes, formatShort, relativeDays, SLOT_LABEL } from "../lib/format";
import { recentCheckIns, subjectProgress } from "../lib/stats";
import type { Planner } from "../planner";
import { useStore } from "../store";

function greeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

const BLOCK_LABEL = { vacation: "Vacation", sick: "Sick day", break: "Study break", other: "Day off" };

export function TodayView({ planner }: { planner: Planner }) {
  const checkIns = useStore((s) => s.checkIns);
  const blocked = useStore((s) => s.blocked);
  const { today, shown, state } = planner;
  const subjects = useMemo(() => new Map(state.subjects.map((s) => [s.id, s])), [state.subjects]);

  const sessions = shown.plan.sessions.filter((s) => s.date === today);
  const record = checkIns[today];
  const blockedToday = blocked.find((b) => b.start <= today && b.end >= today);
  const bufferToday = shown.plan.bufferSlots.filter((s) => s.date === today);
  const examsToday = state.subjects.filter((s) => s.examDate === today);
  const minutes = sessions.reduce((a, s) => a + sessionMinutes(s), 0);
  const slotTimes = useStore((s) => s.settings.slotTimes);
  const now = new Date().getHours() * 60 + new Date().getMinutes();
  // The session happening now, else the next one today.
  const current = sessions.find((s) => slotTimes[s.slot].start <= now && now < slotTimes[s.slot].end);
  const next = current ? undefined : sessions.find((s) => slotTimes[s.slot].start > now);
  const lastEnd = Math.max(0, ...sessions.map((s) => slotTimes[s.slot].end));
  // Evening (or after the last session): the check-in comes first.
  const evening = new Date().getHours() >= 17 || (sessions.length > 0 && now >= lastEnd);
  const canCheckIn = !record && sessions.some((s) => s.items.length > 0);

  const tomorrow = addDays(today, 1);
  const tomorrowSessions = shown.plan.sessions.filter((s) => s.date === tomorrow);

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm text-slate-500 dark:text-slate-400">{formatLongDay(today)}</p>
        <h1 className="mt-0.5 text-2xl font-semibold tracking-tight sm:text-3xl">{greeting()} 👋</h1>
        {sessions.length > 0 && !record && (
          <p className="mt-1 text-slate-600 dark:text-slate-400">
            {sessions.length} session{sessions.length > 1 ? "s" : ""} today · about {formatHours(minutes)}
          </p>
        )}
      </header>

      <AssistantBox planner={planner} />

      {/* On wide screens the plan warning stays on top; on phones it comes after today. */}
      <div className="hidden lg:block">
        <ProposalBanner planner={planner} />
      </div>

      {planner.pendingDays.map((d) => (
        <CheckInCard key={d} planner={planner} date={d} subjects={subjects} prominent />
      ))}

      {canCheckIn && evening && <CheckInCard planner={planner} date={today} subjects={subjects} prominent />}
      <ReminderPrompt planner={planner} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="space-y-4">
          <SectionTitle>Today</SectionTitle>

          {examsToday.map((s) => (
            <Card key={s.id} className="border-indigo-200 dark:border-indigo-500/30">
              <div className="flex items-center gap-3">
                <span className="text-2xl">🎓</span>
                <div>
                  <p className="font-semibold">{s.name} exam today</p>
                  <p className="text-sm text-slate-500">{(s.examHalf ?? "am") === "am" ? "Morning" : "Afternoon"} · Good luck, you prepared for this!</p>
                </div>
              </div>
            </Card>
          ))}

          {record ? (
            <Card>
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                  {record.answer === "yes" ? <PartyPopper size={20} /> : <CalendarCheck2 size={20} />}
                </span>
                <div className="flex-1">
                  <p className="font-semibold">{record.answer === "yes" ? "Day complete. Well done!" : "Checked in for today"}</p>
                  <ul className="mt-1 space-y-0.5 text-sm text-slate-600 dark:text-slate-400">
                    {record.items.map((i, k) => (
                      <li key={k} className={i.done ? "" : "line-through opacity-60"}>
                        {i.title}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          ) : blockedToday ? (
            <Card>
              <EmptyState icon={<Palmtree size={22} />} title={BLOCK_LABEL[blockedToday.reason]}>
                {blockedToday.note ?? "No studying planned. Enjoy it."}
              </EmptyState>
            </Card>
          ) : sessions.length === 0 ? (
            <Card>
              <EmptyState
                icon={bufferToday.length ? <Coffee size={22} /> : <Sparkles size={22} />}
                title={bufferToday.length ? "Buffer time, and you don't need it" : "Nothing planned today"}
              >
                {bufferToday.length
                  ? "You're on track, so your catch-up buffer stays free. Enjoy the time off."
                  : state.subjects.length === 0
                    ? "Add a subject to get your plan."
                    : "Free day. Your next sessions are below."}
              </EmptyState>
            </Card>
          ) : (
            <>
              {sessions.map((s) => {
                const isNow = s === current;
                const isNext = s === next;
                const t = slotTimes[s.slot];
                return (
                  <div key={s.slot}>
                    {(isNow || isNext) && (
                      <p className="mb-1.5 text-xs font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
                        {isNow ? `Now · ${toClock(t.start)}–${toClock(t.end)}` : `Next · ${toClock(t.start)}`}
                      </p>
                    )}
                    <div className={cx("rounded-2xl", (isNow || isNext) && "ring-2 ring-indigo-500/50")}>
                      <SessionCard session={s} subjects={subjects} />
                    </div>
                  </div>
                );
              })}
              {bufferToday.length > 0 && (
                <div className="buffer-stripes rounded-2xl border border-dashed border-amber-300 px-4 py-3 text-sm text-amber-800 dark:border-amber-500/40 dark:text-amber-200">
                  {bufferToday.map((b) => SLOT_LABEL[b.slot]).join(" & ")}: buffer, kept free for catching up.
                </div>
              )}
            </>
          )}

          {canCheckIn && !evening && <CheckInCard planner={planner} date={today} subjects={subjects} />}

          <div className="lg:hidden">
            <ProposalBanner planner={planner} />
          </div>

          {tomorrowSessions.length > 0 && (
            <div>
              <SectionTitle>Tomorrow</SectionTitle>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {tomorrowSessions.map((s) => (
                  <SessionCard key={s.slot} session={s} subjects={subjects} compact />
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="space-y-6">
          <ExamList planner={planner} />
          <Streak planner={planner} />
        </aside>
      </div>
    </div>
  );
}

function ExamList({ planner }: { planner: Planner }) {
  const progress = subjectProgress(planner.state).filter((p) => p.subject.examDate >= planner.today);
  const status = new Map(planner.shown.plan.subjects.map((s) => [s.subjectId, s]));
  if (progress.length === 0) return null;

  return (
    <div>
      <SectionTitle>Exams</SectionTitle>
      <Card className="divide-y divide-slate-100 p-0 sm:p-0 dark:divide-slate-800">
        {progress.map((p) => (
          <ExamRow key={p.subject.id} subject={p.subject} fraction={p.fraction} today={planner.today} deficit={status.get(p.subject.id)?.deficitMinutes ?? 0} remaining={p.remainingMinutes} />
        ))}
      </Card>
    </div>
  );
}

function ExamRow({ subject, fraction, today, deficit, remaining }: { subject: Subject; fraction: number; today: string; deficit: number; remaining: number }) {
  const days = daysBetween(today, subject.examDate);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <ProgressRing value={fraction} color={subject.color ?? "#6366f1"} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 truncate font-medium">
          <SubjectDot color={subject.color} /> {subject.name}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {formatShort(subject.examDate)} · {relativeDays(today, subject.examDate)}
          {remaining > 0 && ` · ${formatMinutes(remaining)} left`}
        </p>
      </div>
      <div className="flex flex-col items-end gap-1">
        <span className="text-lg font-semibold tabular-nums">{days}<span className="text-xs font-normal text-slate-400">d</span></span>
        {deficit > 0 ? <Badge tone="rose">at risk</Badge> : <Badge tone="emerald">on track</Badge>}
      </div>
    </div>
  );
}

function Streak({ planner }: { planner: Planner }) {
  const checkIns = useStore((s) => s.checkIns);
  const { yes, total } = recentCheckIns(checkIns, planner.today);
  const days = Array.from({ length: 7 }, (_, i) => addDays(planner.today, i - 6));
  const blocked = (d: string) => isBlocked(planner.state, d);

  return (
    <div>
      <SectionTitle>Last 7 days</SectionTitle>
      <Card>
        <div className="flex items-center gap-2">
          <Flame size={18} className="text-orange-500" />
          <p className="text-sm">
            {total === 0 ? "Your check-ins will show up here." : `You finished ${yes} of ${total} planned day${total > 1 ? "s" : ""}.`}
          </p>
        </div>
        <div className="mt-3 grid grid-cols-7 gap-1.5">
          {days.map((d) => {
            const r = checkIns[d];
            return (
              <div key={d} className="flex flex-col items-center gap-1">
                <div
                  title={d}
                  className={
                    r?.answer === "yes"
                      ? "h-7 w-full rounded-lg bg-emerald-500"
                      : r?.answer === "no"
                        ? "h-7 w-full rounded-lg bg-rose-300 dark:bg-rose-500/60"
                        : blocked(d)
                          ? "h-7 w-full rounded-lg bg-slate-200 dark:bg-slate-700"
                          : "h-7 w-full rounded-lg bg-slate-100 dark:bg-slate-800"
                  }
                />
                <span className="text-[10px] text-slate-400">{new Date(d + "T12:00").toLocaleDateString("en-GB", { weekday: "narrow" })}</span>
              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
