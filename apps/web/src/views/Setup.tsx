import { addDays, planWithEscalation, type Subject } from "@studymaster/core";
import { ArrowLeft, ArrowRight, CalendarDays, Check, GraduationCap, Layers, Loader2, Plus, Sparkles, Trash2, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { AnkiOnboarding } from "../components/ankiConnect";
import { CalendarSection } from "../components/calendars";
import { BufferSettings, DaysOffEditor, RhythmSettings, StudyStyleEditor } from "../components/settingsForm";
import { useAccount } from "../account";
import { SignInForm } from "../components/account";
import { ImportDialog } from "../components/importer";
import { ChunkList, SubjectFields } from "../components/subjectForm";
import { Badge, Button, Card, NameInput, SubjectDot, cx } from "../components/ui";
import { nextColor } from "../lib/colors";
import { formatHours, formatShort, newId, todayISO } from "../lib/format";
import { useStore } from "../store";

const STEPS = ["Exams", "How you study", "Anki", "Material", "Your week", "Days off", "Your plan"];

export function Setup() {
  const [step, setStep] = useState(-1);
  const subjects = useStore((s) => s.subjects);
  const chunks = useStore((s) => s.chunks);
  const loadDemo = useStore((s) => s.loadDemo);
  const finishSetup = useStore((s) => s.finishSetup);

  const status = useAccount((s) => s.status);
  const initialSynced = useAccount((s) => s.initialSynced);
  // Signed in and the account had no plan yet → start the wizard.
  useEffect(() => {
    if (status === "signedIn" && initialSynced && step < 0) setStep(0);
  }, [status, initialSynced, step]);

  if (step < 0) {
    if (status === "signedIn") {
      return (
        <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-slate-500">
          <Loader2 className="animate-spin text-indigo-600" size={28} />
          Loading your plan…
        </div>
      );
    }
    return <Welcome onStart={() => setStep(0)} onDemo={loadDemo} />;
  }

  // Why "Next" is disabled – always shown, never a silent grey button.
  const blocker =
    step === 0
      ? subjects.length === 0
        ? "Add at least one subject."
        : subjects.some((s) => !s.name.trim())
          ? "Give every subject a name."
          : null
      : step === 3 && chunks.length === 0
        ? "Add some material first – import files or add a lecture."
        : null;

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
        {step === 1 && <StyleStep />}
        {step === 2 && <AnkiStep />}
        {step === 3 && <MaterialStep />}
        {step === 4 && <WeekStep />}
        {step === 5 && <DaysOffStep />}
        {step === 6 && <SummaryStep />}
      </div>

      {blocker && <p className="mt-6 text-center text-sm text-slate-500 sm:hidden">{blocker}</p>}
      <div className="sticky bottom-0 mt-8 flex items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 py-4 pb-safe dark:border-slate-800 dark:bg-slate-950">
        <Button variant="ghost" onClick={() => setStep(step - 1)}>
          <ArrowLeft size={16} /> Back
        </Button>
        {step < STEPS.length - 1 ? (
          <div className="flex items-center gap-3">
            {blocker && <span className="hidden text-right text-sm text-slate-500 sm:block">{blocker}</span>}
            <Button onClick={() => setStep(step + 1)} disabled={!!blocker}>
              Next <ArrowRight size={16} />
            </Button>
          </div>
        ) : (
          <Button variant="success" onClick={finishSetup}>
            <Check size={16} /> Start studying
          </Button>
        )}
      </div>
    </div>
  );
}

const FEATURES: [typeof GraduationCap, string][] = [
  [GraduationCap, "Main study ends early, with a short review right before each exam"],
  [Layers, "Your way of studying: reading, lectures, summaries, Anki – in your order"],
  [CalendarDays, "A weekly buffer half-day for catching up, free if you don't need it"],
];

function FeatureList() {
  return (
    <ul className="space-y-3 text-slate-700 dark:text-slate-300">
      {FEATURES.map(([Icon, text]) => (
        <li key={text} className="flex items-start gap-3">
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400">
            <Icon size={16} />
          </span>
          {text}
        </li>
      ))}
    </ul>
  );
}

/** Landing page: sign in first (Google or email); no account is optional. */
function Welcome({ onStart, onDemo }: { onStart: () => void; onDemo: () => void }) {
  const configured = useAccount((s) => s.configured);
  const intro = (
    <>
      <img src="/icon.svg" alt="" className="mb-6 h-14 w-14 rounded-2xl shadow-lg shadow-indigo-500/20" />
      <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Your exams, planned.</h1>
      <p className="mt-3 text-lg text-slate-600 dark:text-slate-400">
        Tell StudyMaster what you have to learn and when your exams are. It plans every session – watching lectures, reading, writing and
        studying Anki cards – and adjusts when life gets in the way.
      </p>
    </>
  );

  if (!configured) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center px-6 py-12">
        {intro}
        <div className="mt-8">
          <FeatureList />
        </div>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row">
          <Button size="lg" onClick={onStart}>
            Set up my plan <ArrowRight size={18} />
          </Button>
          <Button size="lg" variant="secondary" onClick={onDemo}>
            <Sparkles size={18} /> Try with example data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto grid min-h-dvh max-w-5xl grid-cols-1 items-center gap-10 px-6 py-10 lg:grid-cols-[1fr_420px] lg:gap-16">
      <div>
        {intro}
        <div className="mt-8 hidden lg:block">
          <FeatureList />
        </div>
      </div>
      <div>
        <Card className="p-5 sm:p-6">
          <h2 className="mb-1 text-lg font-semibold">Sign in to start</h2>
          <p className="mb-5 text-sm text-slate-500 dark:text-slate-400">Same account on phone and laptop – your plan is simply there.</p>
          <SignInForm />
        </Card>
        <div className="mt-4 flex flex-wrap justify-center gap-x-5 gap-y-2 text-sm">
          <button type="button" className="text-slate-600 hover:underline dark:text-slate-400" onClick={onStart}>
            Continue without an account
          </button>
          <button type="button" className="inline-flex items-center gap-1 text-slate-600 hover:underline dark:text-slate-400" onClick={onDemo}>
            <Sparkles size={14} /> Try with example data
          </button>
        </div>
      </div>
      <div className="lg:hidden">
        <FeatureList />
      </div>
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
  const [importing, setImporting] = useState(false);
  const removeSubject = useStore((s) => s.removeSubject);
  const upsertSubject = useStore((s) => s.upsertSubject);
  const subject = subjects.find((s) => s.id === active) ?? subjects[0];
  const empty = subjects.filter((s) => !chunks.some((c) => c.subjectId === s.id));

  return (
    <div>
      <StepHeader title="What do you have to learn?">
        Add the lectures for each subject: recording length, plus the slide deck or chapter that goes with it. Fastest: import your folder of
        slides, PDFs and videos – you check the list before anything is added.
      </StepHeader>
      <Button variant="secondary" className="mb-4 w-full sm:w-auto" onClick={() => setImporting(true)}>
        <Upload size={16} /> Import slides, PDFs or videos
      </Button>
      <ImportDialog open={importing} onClose={() => setImporting(false)} />
      {empty.length > 0 && chunks.length > 0 && (
        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm dark:border-amber-500/30 dark:bg-amber-500/10">
          <p>
            {empty.map((s) => s.name || "Unnamed subject").join(", ")} {empty.length === 1 ? "has" : "have"} no material yet. Add some, or remove{" "}
            {empty.length === 1 ? "it" : "them"} if {empty.length === 1 ? "it was" : "they were"} created by mistake. You can also continue and add
            material later.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {empty.map((s) => (
              <Button key={s.id} size="sm" variant="secondary" onClick={() => removeSubject(s.id)}>
                <Trash2 size={14} /> Remove {s.name || "unnamed subject"}
              </Button>
            ))}
          </div>
        </div>
      )}
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
        <Card className="space-y-4">
          <NameInput label="Subject name" value={subject.name} onChange={(name) => upsertSubject({ ...subject, name })} />
          <ChunkList subject={subject} />
        </Card>
      )}
    </div>
  );
}

function StyleStep() {
  return (
    <div>
      <StepHeader title="How do you study?">
        Pick the steps you go through for each lecture or chapter, in your order. The default is reading, then making Anki cards and studying
        them. Everything can be changed later in Settings.
      </StepHeader>
      <Card>
        <StudyStyleEditor />
      </Card>
    </div>
  );
}

function AnkiStep() {
  return (
    <div>
      <StepHeader title="Do you use Anki?">
        Anki is a free flashcard app. StudyMaster can plan your Anki time and open the right deck with one tap.
      </StepHeader>
      <Card>
        <AnkiOnboarding />
      </Card>
    </div>
  );
}

function WeekStep() {
  return (
    <div>
      <StepHeader title="When do you study?">Pick a preset or tap single half-days. One session is 2–3 hours: lecture work first, then Anki.</StepHeader>
      <div className="space-y-4">
        <Card>
          <RhythmSettings />
        </Card>
        <Card>
          <h3 className="mb-1 flex items-center gap-2 font-semibold">
            <CalendarDays size={18} className="text-indigo-600" /> Classes at the university?
          </h3>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">Optional – the plan then goes around your timetable.</p>
          <CalendarSection />
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
