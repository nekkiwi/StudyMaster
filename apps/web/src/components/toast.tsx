import { CheckCircle2, Info } from "lucide-react";
import { create } from "zustand";
import { cx } from "./ui";

interface Toast {
  id: number;
  text: string;
  tone: "info" | "success";
  action?: { label: string; run: () => void };
}

const useToasts = create<{ toasts: Toast[] }>(() => ({ toasts: [] }));
let nextId = 1;

export function toast(text: string, options: { tone?: Toast["tone"]; action?: Toast["action"] } = {}): void {
  const id = nextId++;
  useToasts.setState((s) => ({ toasts: [...s.toasts, { id, text, tone: options.tone ?? "info", action: options.action }].slice(-2) }));
  setTimeout(() => useToasts.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 6000);
}

export function Toaster() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 md:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          role="status"
          className="pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-slate-900 px-4 py-3 text-sm text-white shadow-xl dark:bg-white dark:text-slate-900"
        >
          {t.tone === "success" ? (
            <CheckCircle2 size={18} className="shrink-0 text-emerald-400 dark:text-emerald-600" />
          ) : (
            <Info size={18} className="shrink-0 text-indigo-300 dark:text-indigo-600" />
          )}
          <span className="flex-1">{t.text}</span>
          {t.action && (
            <button
              className={cx("font-semibold text-indigo-300 hover:underline dark:text-indigo-600")}
              onClick={() => {
                t.action!.run();
                useToasts.setState((s) => ({ toasts: s.toasts.filter((x) => x.id !== t.id) }));
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
