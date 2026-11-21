import { diffPlans, type Plan } from "@studymaster/core";
import { BookMarked, CalendarDays, Home, Settings as SettingsIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccount, wasSignedIn } from "./account";
import { AccountChip, PlanChoiceDialog, SignInDialog } from "./components/account";
import { toast, Toaster } from "./components/toast";
import { cx } from "./components/ui";
import { formatShort } from "./lib/format";
import { usePlanner } from "./planner";
import { useStore } from "./store";
import { PlanView } from "./views/PlanView";
import { SettingsView } from "./views/SettingsView";
import { Setup } from "./views/Setup";
import { SubjectsView } from "./views/Subjects";
import { TodayView } from "./views/Today";

type Tab = "today" | "plan" | "subjects" | "settings";

const TABS: { id: Tab; label: string; icon: typeof Home }[] = [
  { id: "today", label: "Today", icon: Home },
  { id: "plan", label: "Plan", icon: CalendarDays },
  { id: "subjects", label: "Subjects", icon: BookMarked },
  { id: "settings", label: "Settings", icon: SettingsIcon },
];

function useTab(): [Tab, (t: Tab) => void] {
  const read = (): Tab => {
    const h = window.location.hash.slice(1) as Tab;
    return TABS.some((t) => t.id === h) ? h : "today";
  };
  const [tab, setTab] = useState<Tab>(read);
  useEffect(() => {
    const on = () => setTab(read());
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return [
    tab,
    (t) => {
      window.location.hash = t;
      setTab(t);
      window.scrollTo({ top: 0 });
    },
  ];
}

/** After a check-in, tell the user what moved in the plan. */
function usePlanChangeNotes(plan: Plan) {
  const checkIns = useStore((s) => s.checkIns);
  const previous = useRef<{ plan: Plan; count: number } | null>(null);
  useEffect(() => {
    const count = Object.keys(checkIns).length;
    const before = previous.current;
    previous.current = { plan, count };
    if (!before || before.count >= count) return;
    const moved = diffPlans(before.plan, plan).filter((c) => c.after.length > 0 && c.before.length > 0);
    if (moved.length === 0) return;
    const first = moved[0]!;
    const text =
      moved.length === 1
        ? `Plan updated: ${first.title} is now on ${formatShort(first.after[0]!)}.`
        : "Plan updated: the following days shifted to make room.";
    setTimeout(() => toast(text), 400);
  }, [plan, checkIns]);
}

export default function App() {
  const setupDone = useStore((s) => s.setupDone);
  const start = useAccount((s) => s.start);
  // Devices that signed in before load Firebase right away to sync.
  useEffect(() => {
    if (wasSignedIn()) void start();
  }, [start]);
  return (
    <>
      {setupDone ? <Main /> : <Setup />}
      <PlanChoiceDialog />
      {!setupDone && <Toaster />}
    </>
  );
}

function Main() {
  const [tab, setTab] = useTab();
  const [signIn, setSignIn] = useState(false);
  const planner = usePlanner();
  usePlanChangeNotes(planner.shown.plan);
  const attention = planner.pendingDays.length > 0 || (!!planner.proposal && !planner.declined);

  return (
    <div className="min-h-dvh md:flex">
      <aside className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-slate-200/80 bg-white/60 px-3 py-6 backdrop-blur md:flex dark:border-slate-800 dark:bg-slate-900/40">
        <div className="mb-8 flex items-center gap-2.5 px-3">
          <img src="/icon.svg" alt="" className="h-8 w-8 rounded-lg" />
          <span className="text-lg font-semibold tracking-tight">StudyMaster</span>
        </div>
        <nav className="space-y-1">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cx(
                "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition",
                tab === id
                  ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
              )}
            >
              <Icon size={18} /> {label}
              {id === "today" && attention && <span className="ml-auto h-2 w-2 rounded-full bg-rose-500" />}
            </button>
          ))}
        </nav>
        <div className="mt-auto">
          <AccountChip onSignIn={() => setSignIn(true)} />
        </div>
        <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
      </aside>

      <main className="mx-auto w-full max-w-6xl px-4 pt-6 pb-28 sm:px-6 md:px-10 md:pt-10 md:pb-12">
        {tab === "today" && <TodayView planner={planner} />}
        {tab === "plan" && <PlanView planner={planner} />}
        {tab === "subjects" && <SubjectsView planner={planner} />}
        {tab === "settings" && <SettingsView />}
      </main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/90 pb-safe backdrop-blur md:hidden dark:border-slate-800 dark:bg-slate-900/90">
        <div className="grid grid-cols-4">
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={cx(
                "relative flex flex-col items-center gap-0.5 py-2.5 text-[11px] font-medium",
                tab === id ? "text-indigo-600 dark:text-indigo-400" : "text-slate-500 dark:text-slate-400",
              )}
            >
              <Icon size={22} strokeWidth={tab === id ? 2.4 : 1.8} />
              {label}
              {id === "today" && attention && <span className="absolute top-2 left-[calc(50%+8px)] h-2 w-2 rounded-full bg-rose-500" />}
            </button>
          ))}
        </div>
      </nav>
      <Toaster />
    </div>
  );
}
