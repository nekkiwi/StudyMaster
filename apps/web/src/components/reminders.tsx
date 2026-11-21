/** Evening check-in reminder: switch, Today prompt and background sync with the scheduler. */
import { BellRing, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAccount } from "../account";
import { useDevice } from "../lib/device";
import { disableReminders, enableReminders, pushSupport, syncReminders, type ReminderInfo } from "../lib/push";
import type { Planner } from "../planner";
import { useStore } from "../store";
import { toast } from "./toast";
import { Button, Card, Toggle } from "./ui";

/** What the scheduler needs to know: time, planned study days, last check-in. */
function useReminderInfo(planner: Planner): ReminderInfo {
  const time = useStore((s) => s.checkInTime);
  const checkIns = useStore((s) => s.checkIns);
  const sessions = planner.shown.plan.sessions;
  return useMemo(() => {
    const planDates = [...new Set(sessions.filter((s) => s.items.some((i) => i.kind !== "anki")).map((s) => s.date))]
      .filter((d) => d >= planner.today)
      .sort()
      .slice(0, 45);
    const lastCheckIn = Object.keys(checkIns).sort().pop();
    return { time, planDates, ...(lastCheckIn ? { lastCheckIn } : {}) };
  }, [time, checkIns, sessions, planner.today]);
}

/** Keeps the reminder scheduler up to date (only on devices with reminders on). Mounted once in App. */
export function ReminderSync({ planner }: { planner: Planner }) {
  const info = useReminderInfo(planner);
  const on = useDevice((s) => !!s.pushEndpoint);
  const signedIn = useAccount((s) => s.status === "signedIn");
  const last = useRef("");
  useEffect(() => {
    if (!on || !signedIn) return;
    const key = JSON.stringify(info);
    if (key === last.current) return;
    const timer = setTimeout(() => {
      syncReminders(info)
        .then(() => (last.current = key))
        .catch(() => undefined);
    }, 2000);
    return () => clearTimeout(timer);
  }, [info, on, signedIn]);
  return null;
}

/** On/off switch for this device (Settings → Evening check-in). */
export function ReminderToggle({ planner }: { planner: Planner }) {
  const info = useReminderInfo(planner);
  const on = useDevice((s) => !!s.pushEndpoint);
  const signedIn = useAccount((s) => s.status === "signedIn");
  const [busy, setBusy] = useState(false);
  const support = pushSupport();

  const toggle = async (next: boolean) => {
    setBusy(true);
    try {
      if (next) {
        await enableReminders(info);
        toast(`Reminder on – at ${info.time} on days with sessions, unless you've checked in.`, { tone: "success" });
      } else {
        await disableReminders();
        toast("Reminder off on this device.");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Reminders didn't work.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <Toggle checked={on} onChange={toggle} label="Remind me on this device" />
        </div>
        {busy && <Loader2 size={16} className="animate-spin text-slate-400" />}
      </div>
      <p className="text-xs text-slate-500">
        {!signedIn
          ? "Sign in to get reminders."
          : support === "install-first"
            ? "On iPhone: add StudyMaster to your Home Screen first (Share → Add to Home Screen), then turn this on there."
            : support === "denied"
              ? "Notifications are blocked – allow them for StudyMaster in your browser or phone settings."
              : support === "unsupported"
                ? "This browser can't show reminders."
                : "A notification at check-in time on days with sessions – only if you haven't checked in yet."}
      </p>
    </div>
  );
}

/** Today: a one-time card offering the reminder (phones and signed-in users only). */
export function ReminderPrompt({ planner }: { planner: Planner }) {
  const info = useReminderInfo(planner);
  const on = useDevice((s) => !!s.pushEndpoint);
  const asked = useDevice((s) => s.reminderAsked);
  const setAsked = useDevice((s) => s.setReminderAsked);
  const signedIn = useAccount((s) => s.status === "signedIn");
  const [busy, setBusy] = useState(false);
  const support = pushSupport();
  if (on || asked || !signedIn || support === "unsupported" || support === "denied" || info.planDates.length === 0) return null;

  const enable = async () => {
    setBusy(true);
    try {
      await enableReminders(info);
      toast(`Reminder on – at ${info.time} on days with sessions.`, { tone: "success" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Reminders didn't work.");
    } finally {
      setBusy(false);
      setAsked(true);
    }
  };

  return (
    <Card className="border-indigo-200 bg-indigo-50/60 dark:border-indigo-500/30 dark:bg-indigo-500/5">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-300">
          <BellRing size={18} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Get a nudge at {info.time}?</p>
          <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
            {support === "install-first"
              ? "Add StudyMaster to your Home Screen (Share → Add to Home Screen), open it from there and turn on the evening reminder."
              : "One notification on study days so you remember to check in – two taps and your plan stays right."}
          </p>
          {support === "ok" && (
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={enable} disabled={busy}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <BellRing size={14} />} Turn on
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAsked(true)}>
                Not now
              </Button>
            </div>
          )}
        </div>
        <button type="button" onClick={() => setAsked(true)} aria-label="Close" className="rounded-lg p-1 text-slate-400 hover:bg-white/60">
          <X size={16} />
        </button>
      </div>
    </Card>
  );
}
