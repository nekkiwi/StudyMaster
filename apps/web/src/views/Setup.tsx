import { addDays, planWithEscalation, type Subject } from "@studymaster/core";
import { ArrowLeft, ArrowRight, CalendarDays, Check, GraduationCap, Layers, Plus, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { BufferSettings, DaysOffEditor, RhythmSettings } from "../components/settingsForm";
import { ChunkList, SubjectFields } from "../components/subjectForm";
import { Badge, Button, Card, cx, SubjectDot } from "../components/ui";
import { nextColor } from "../lib/colors";
import { formatHours, formatShort, newId, todayISO } from "../lib/format";
import { useStore } from "../store";

const STEPS = ["Exams", "Material", "Your week", "Days off", "Your plan"];

export function Setup() {
  const [step, setStep] = useState(-1);
  const subjects = useStore((s) => s.subjects);
  const chunks = useStore((s) => s.chunks);
  const loadDemo = useStore((s) => s.loadDemo);
  const finishSetup = useStore((s) => s.finishSetup);

  if (step < 0) return <Welcome onStart={() => setStep(0)} onDemo={loadDemo} />;

  const canNext =
    step === 0
      ? subjects.length > 0 && subjects.every((s) => s.name.trim())
      : step === 1
        ? subjects.every((s) => chunks.some((c) => c.subjectId === s.id))
        : true;

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 py-6 sm:py-10">
      <div className="mb-6 flex items-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            disabled={i > step}
            onClick={() => setStep(i)}
            className="flex flex-1 flex-col gap-1.5 text-left"
          >
            <span className={cx("h-1.5 rounded-full transition", i <= step ? "bg-indigo-600" : "bg-slate-200 dark:bg-slate-800")} />
            <span className={cx("hidden text-xs font-medium sm:block", i === step ? "text-indigo-600 dark:text-indigo-400" : "text-slate-400")}>{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1">
        {step === 0 && <SubjectsStep />}
        {step === 1 && <MaterialStep />}
        {step === 2 && <WeekStep />}
        {step === 3 && <DaysOffStep />}
        {step === 4 && <SummaryStep />}
      </div>

      <div className="sticky bottom-0 mt-8 flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 py-4 pb-safe dark:border-slate-800 dark:bg-slate-950">
        <Button variant="ghost" onClick={() => setStep(step - 1)}>
          <ArrowLeft size={16} /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
            Next <ArrowRight size={16} />
          </Button>
        ) : (
          <Button variant="success" onClick={finishSetup}>
            <Check size={16} /> Start studying
          </Button>
        )}
      </div>
    </div>
  );
}

function Welcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-12">
      <img src="/icon.svg" alt="" className="mb-6 h-16 w-16 rounded-2xl shadow-lg shadow-indigo-500/20" />
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your exams, planned.</h1>
      <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
        Tell StudyMaster what you have to learn and when your exams are. It plans every session, including
        watching lectures, reading, writing and studying Anki cards, and adjusts when life gets in the way.
      </p>
      <ul className="mt-8 space-y-3 text-slate-700 dark:text-slate-300">
        {[
          [GraduationCap, "Main study ends early, with a short review right before each exam"],
          [Layers, "Every lecture: watch → read → write cards, then study Anki"],
          [CalendarDays, "A weekly buffer half-day for catching up, free if you don't need it"],
        ].map(([Icon, text], i) => {
          const I = Icon as typeof GraduationCap;
          return (
            <li key={i} className="flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
                <I size={16} />
              </span>
              {text as string}
            </li>
          );
        })}
      </ul>
      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button size="lg" onClick={onStart}>
          Set up my plan <ArrowRight size={18} />
        </Button>
        <Button size="lg" variant="secondary" onClick={onDemo}>
          <Sparkles size={18} /> Try with example data
        </Button>
      </div>
      <p className="mt-6 text-sm text-slate-500">Takes about 5 minutes. Your data stays on this device.</p>
    </div>
  );
}

function StepHeader({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <header className="mb-6">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-slate-600 dark:text-slate-400">{children}</p>
    </header>
  );
}

function SubjectsStep() {
  const subjects = useStore((s) => s.subjects);
  const upsert = useStore((s) => s.upsertSubject);
  const remove = useStore((s) => s.removeSubject);

  const add = () =>
    upsert({
      id: newId(),
      name: "",
      color: nextColor(subjects.map((s) => s.color)),
      weight: 1,
      examDate: addDays(todayISO(), 28),
    });

  useEffect(() => {
    // Read the live store so React's double effect run in dev doesn't add two.
    if (useStore.getState().subjects.length === 0) add();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subjects.length]);

  return (
    <div>
      <StepHeader title="Which exams are coming up?">Add every subject with its exam date, and how hard it is for you.</StepHeader>
      <div className="space-y-4">
        {subjects.map((s) => (
          <Card key={s.id} className="relative">
            <span className="absolute inset-y-4 left-0 w-1 rounded-r-full" style={{ background: s.color }} />
            {subjects.length > 1 && (
              <button
                onClick={() => remove(s.id)}
                className="absolute top-3 right-3 rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
                aria-label="Remove subject"
              >
                <Trash2 size={16} />
              </button>
            )}
            <SubjectFields subject={s} onChange={upsert} />
          </Card>
        ))}
        <Button variant="secondary" className="w-full" onClick={add}>
          <Plus size={16} /> Another subject
        </Button>
      </div>
    </div>
  );
}

function MaterialStep() {
  const subjects = useStore((s) => s.subjects);
  const chunks = useStore((s) => s.chunks);
  const [active, setActive] = useState(subjects[0]?.id ?? "");
  const subject = subjects.find((s) => s.id === active) ?? subjects[0];

  return (
    <div>
      <StepHeader title="What do you have to learn?">
        Add the lectures for each subject: recording length, plus the slide deck or chapter that goes with it. Tip: "Add many at once" is fastest.
      </StepHeader>
      <div className="mb-4 flex flex-wrap gap-2">
        {subjects.map((s) => {
          const count = chunks.filter((c) => c.subjectId === s.id).length;
          return (
            <button
              key={s.id}
              onClick={() => setActive(s.id)}
              className={cx(
                "flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition",
                s.id === subject?.id ? "border-indigo-300 bg-white shadow-sm dark:border-indigo-500/50 dark:bg-slate-900" : "border-transparent text-slate-500 hover:bg-white dark:hover:bg-slate-900",
              )}
            >
              <SubjectDot color={s.color} /> {s.name}
              <Badge tone={count ? "emerald" : "amber"}>{count}</Badge>
            </button>
          );
        })}
      </div>
      {subject && (
        <Card>
          <ChunkList subject={subject} />
        </Card>
      )}
    </div>
  );
}

function WeekStep() {
  return (
    <div>
      <StepHeader title="How do you like to study?">Pick the half-days you study. One session is 2–3 hours: lecture work first, then Anki. The preset is weekday afternoons plus one half-day on Saturday and Sunday.</StepHeader>
      <div className="space-y-4">
        <Card>
          <RhythmSettings />
        </Card>
        <Card>
          <BufferSettings />
        </Card>
      </div>
    </div>
  );
}

function DaysOffStep() {
  return (
    <div>
      <StepHeader title="When can't you study?">Vacation, a planned break, appointments: nothing gets planned on these days. You can add sick days later anytime.</StepHeader>
      <Card>
        <DaysOffEditor />
      </Card>
    </div>
  );
}

function SummaryStep() {
  const subjects = useStore((s) => s.subjects);
  const chunks = useStore((s) => s.chunks);
  const blocked = useStore((s) => s.blocked);
  const settings = useStore((s) => s.settings);
  const result = planWithEscalation({ subjects, chunks, blocked, settings }, todayISO());
  const study = result.plan.sessions.filter((s) => s.type === "study");
  const minutes = result.plan.subjects.reduce((a, s) => a + s.remainingMinutes, 0);
  const byId = new Map<string, Subject>(subjects.map((s) => [s.id, s]));

  return (
    <div>
      <StepHeader title={result.level === "normal" ? "Your plan is ready 🎉" : "Your plan needs a decision"}>
        {result.level === "normal"
          ? "Everything fits with your normal rhythm. You can change anything later."
          : "It doesn't all fit with your normal rhythm. You'll see the options on the Today screen."}
      </StepHeader>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card>
          <p className="text-sm text-slate-500">Total work</p>
          <p className="mt-1 text-2xl font-semibold">{formatHours(minutes)}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Study sessions</p>
          <p className="mt-1 text-2xl font-semibold">{study.length}</p>
        </Card>
        <Card>
          <p className="text-sm text-slate-500">Weekly buffers kept free</p>
          <p className="mt-1 text-2xl font-semibold">{new Set(result.plan.bufferSlots.map((b) => b.date)).size}</p>
        </Card>
      </div>
      <Card className="mt-4 divide-y divide-slate-100 p-0 sm:p-0 dark:divide-slate-800">
        {result.plan.subjects.map((s) => {
          const subject = byId.get(s.subjectId)!;
          return (
            <div key={s.subjectId} className="flex items-center gap-3 px-4 py-3">
              <SubjectDot color={subject.color} />
              <div className="flex-1">
                <p className="font-medium">{subject.name}</p>
                <p className="text-xs text-slate-500">
                  Exam {formatShort(subject.examDate)}
                  {s.lastStudyDate && ` · main study done by ${formatShort(s.lastStudyDate)}`}
                  {s.hasReview && " · review before the exam"}
                </p>
              </div>
              {s.deficitMinutes > 0 ? <Badge tone="rose">{formatHours(s.deficitMinutes)} short</Badge> : <Badge tone="emerald">fits</Badge>}
            </div>
          );
        })}
      </Card>
      {result.warnings.length > 0 && (
        <ul className="mt-4 space-y-1 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          {result.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-sm text-slate-500">You can change subjects, material and settings anytime later.</p>
    </div>
  );
}
