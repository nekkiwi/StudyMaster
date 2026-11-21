import { ArrowUp, Check, Loader2, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import { useAccount } from "../account";
import { applyChanges, buildContext, reviewActions, snapshot, suggestions, type ProposedChange } from "../lib/assistant";
import { post } from "../lib/calendarApi";
import { isCloudConfigured } from "../lib/firebaseConfig";
import type { Planner } from "../planner";
import { useStore } from "../store";
import { SignInDialog } from "./account";
import { toast } from "./toast";
import { Button, Card, cx } from "./ui";

interface Turn {
  role: "user" | "assistant";
  text: string;
}

interface Answer {
  reply: string;
  changes: ProposedChange[];
  /** The plan the changes were made for (check-ins refer to it). */
  plan: Planner["shown"]["plan"];
}

/**
 * "Tell StudyMaster…": one line to change the plan in plain words. The helper
 * only proposes; nothing changes until "Apply".
 */
export function AssistantBox({ planner, className }: { planner: Planner; className?: string }) {
  const signedIn = useAccount((s) => s.status === "signedIn");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const [left, setLeft] = useState<number | null>(null);
  const [signIn, setSignIn] = useState(false);
  const history = useRef<Turn[]>([]);
  const input = useRef<HTMLInputElement>(null);

  if (!isCloudConfigured) return null;

  const send = async (message: string) => {
    message = message.trim();
    if (!message || busy) return;
    if (!signedIn) {
      setSignIn(true);
      return;
    }
    setBusy(true);
    setError("");
    setAnswer(null);
    const data = useStore.getState();
    const plan = planner.shown.plan;
    const context = buildContext(data, plan, planner.today, { betterPlanWaiting: !!planner.proposal && !planner.declined });
    try {
      const res = await post<{ reply: string; actions: unknown[]; left: number }>("/api/assistant", {
        message,
        context: context.text,
        history: history.current,
      });
      const changes = reviewActions(res.actions ?? [], data, plan, planner.today, context.ids);
      history.current = [...history.current, { role: "user" as const, text: message }, { role: "assistant" as const, text: res.reply }].slice(-4);
      setAnswer({ reply: res.reply, changes, plan });
      setLeft(res.left);
      setText("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "That didn't work. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const apply = () => {
    if (!answer) return;
    const state = useStore.getState();
    const before = snapshot(state);
    useStore.setState(applyChanges(state, answer.changes, answer.plan));
    setAnswer(null);
    toast("Done – your plan is updated.", { tone: "success", action: { label: "Undo", run: () => useStore.setState(before) } });
  };

  const cancel = () => {
    setAnswer(null);
    input.current?.focus();
  };

  const chips = suggestions(useStore.getState(), planner.shown.plan, planner.today);

  return (
    <Card className={cx("space-y-3 p-3 sm:p-4", className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void send(text);
        }}
        className="flex items-center gap-2"
      >
        <Sparkles size={18} className="ml-1 shrink-0 text-indigo-500" aria-hidden />
        <input
          ref={input}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Tell StudyMaster…"
          aria-label="Tell StudyMaster what changed"
          maxLength={1000}
          enterKeyHint="send"
          className="min-w-0 flex-1 bg-transparent py-2 text-base outline-none placeholder:text-slate-400 sm:text-sm"
        />
        <Button type="submit" size="sm" disabled={busy || !text.trim()} aria-label="Send" className="h-9 w-9 shrink-0 !rounded-full !p-0">
          {busy ? <Loader2 size={16} className="animate-spin" /> : <ArrowUp size={16} />}
        </Button>
      </form>

      {!answer && !busy && !text && (
        <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none]">
          {chips.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => void send(c)}
              className="shrink-0 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-indigo-50 hover:text-indigo-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-500/10 dark:hover:text-indigo-300"
            >
              {c}
            </button>
          ))}
        </div>
      )}

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">{error}</p>}

      {answer && (
        <div className="space-y-3 rounded-2xl bg-indigo-50/70 p-3 dark:bg-indigo-500/10">
          <p className="text-sm text-slate-700 dark:text-slate-200">{answer.reply}</p>
          {answer.changes.length > 0 && (
            <>
              <ul className="space-y-1.5">
                {answer.changes.map((c, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm font-medium text-slate-800 dark:text-slate-100">
                    <Check size={16} className="mt-0.5 shrink-0 text-indigo-500" /> {c.label}
                  </li>
                ))}
              </ul>
              <div className="flex gap-2">
                <Button size="sm" onClick={apply}>
                  <Check size={16} /> Apply
                </Button>
                <Button size="sm" variant="ghost" onClick={cancel}>
                  <X size={16} /> Cancel
                </Button>
              </div>
            </>
          )}
          {answer.changes.length === 0 && (
            <button type="button" onClick={() => setAnswer(null)} className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400">
              OK
            </button>
          )}
        </div>
      )}

      {left !== null && left <= 5 && (
        <p className="text-xs text-slate-500">{left === 0 ? "That was the last message for today." : `${left} message${left === 1 ? "" : "s"} left today.`}</p>
      )}
      {!signedIn && !answer && <p className="px-1 text-xs text-slate-500">Sign in to use it – it changes your plan in plain words.</p>}
      <SignInDialog open={signIn} onClose={() => setSignIn(false)} />
    </Card>
  );
}
