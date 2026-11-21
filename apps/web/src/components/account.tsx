import { Cloud, CloudOff, Loader2, LogOut, RefreshCw, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { useAccount, type SyncState } from "../account";
import { createAccount, errorMessage, sendReset, signInWithEmail, signInWithGoogle } from "../lib/cloud";
import { formatShort } from "../lib/format";
import { toast } from "./toast";
import { Button, cx, Field, Modal, TextInput } from "./ui";

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Sign in with Google or email + password; create an account; reset the password. */
export function SignInDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const start = useAccount((s) => s.start);
  const status = useAccount((s) => s.status);
  const [mode, setMode] = useState<"signIn" | "create">("signIn");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"google" | "email" | "reset" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) void start();
  }, [open, start]);

  // Close as soon as the sign-in went through.
  useEffect(() => {
    if (open && status === "signedIn") {
      toast("Signed in. Your plan now syncs across your devices.", { tone: "success" });
      onClose();
    }
  }, [open, status, onClose]);

  const attempt = async (what: NonNullable<typeof busy>, fn: () => Promise<void>) => {
    setBusy(what);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void attempt("email", () => (mode === "create" ? createAccount(email, password) : signInWithEmail(email, password)));
  };

  const reset = () => {
    if (!email.trim()) {
      setError("Enter your email first, then tap “Forgot password?” again.");
      return;
    }
    void attempt("reset", async () => {
      await sendReset(email);
      toast("If there's an account for this email, a reset link is on its way.", { tone: "success" });
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={mode === "create" ? "Create your account" : "Sign in"}>
      <div className="space-y-5">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          With an account your plan is saved online and stays in sync on your phone and laptop.
        </p>
        <Button variant="secondary" size="lg" className="w-full" onClick={() => void attempt("google", signInWithGoogle)} disabled={!!busy}>
          {busy === "google" ? <Loader2 size={18} className="animate-spin" /> : <GoogleLogo />} Continue with Google
        </Button>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" /> or with email <span className="h-px flex-1 bg-slate-200 dark:bg-slate-700" />
        </div>
        <form className="space-y-3" onSubmit={submit}>
          <Field label="Email">
            <TextInput type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </Field>
          <Field label="Password" hint={mode === "create" ? "At least 6 characters." : undefined}>
            <TextInput
              type="password"
              autoComplete={mode === "create" ? "new-password" : "current-password"}
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </Field>
          {error && <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">{error}</p>}
          <Button type="submit" size="lg" className="w-full" disabled={!!busy}>
            {busy === "email" && <Loader2 size={18} className="animate-spin" />}
            {mode === "create" ? "Create account" : "Sign in"}
          </Button>
        </form>
        <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
          <button type="button" className="font-medium text-indigo-600 hover:underline dark:text-indigo-400" onClick={() => { setMode(mode === "create" ? "signIn" : "create"); setError(""); }}>
            {mode === "create" ? "I already have an account" : "New here? Create an account"}
          </button>
          {mode === "signIn" && (
            <button type="button" className="text-slate-500 hover:underline" onClick={reset} disabled={!!busy}>
              Forgot password?
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}

/** Asked once when this device and the account both have a plan. */
export function PlanChoiceDialog() {
  const choice = useAccount((s) => s.choice);
  const resolve = useAccount((s) => s.resolveChoice);
  if (!choice) return null;
  const count = (d: { subjects?: unknown[]; chunks?: unknown[] }) => `${d.subjects?.length ?? 0} subjects, ${d.chunks?.length ?? 0} items`;
  return (
    <Modal open onClose={() => void resolve("account")} title="Which plan do you want to keep?">
      <div className="space-y-4">
        <p className="text-sm text-slate-600 dark:text-slate-400">This device has a plan, and your account has one too. The other one will be replaced.</p>
        <button
          type="button"
          onClick={() => void resolve("account")}
          className="w-full rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left hover:border-indigo-400 dark:border-indigo-500/30 dark:bg-indigo-500/10"
        >
          <p className="font-semibold">Use my account's plan</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            {count(choice.remote.data)} · saved {formatShort(new Date(choice.remote.updatedAt).toISOString().slice(0, 10))}
          </p>
        </button>
        <button
          type="button"
          onClick={() => void resolve("device")}
          className="w-full rounded-2xl border border-slate-200 p-4 text-left hover:border-slate-400 dark:border-slate-700"
        >
          <p className="font-semibold">Keep this device's plan</p>
          <p className="text-sm text-slate-600 dark:text-slate-400">{count(choice.local)} · replaces the plan in your account</p>
        </button>
      </div>
    </Modal>
  );
}

const SYNC_TEXT: Record<SyncState, { text: string; icon: typeof Cloud }> = {
  off: { text: "Not syncing", icon: CloudOff },
  syncing: { text: "Syncing…", icon: RefreshCw },
  synced: { text: "Synced", icon: Cloud },
  offline: { text: "Offline – will sync later", icon: CloudOff },
};

/** Sidebar footer: who's signed in and whether the plan is synced. */
export function AccountChip({ onSignIn }: { onSignIn: () => void }) {
  const { configured, status, user, sync } = useAccount();
  if (!configured) return <p className="px-3 text-xs text-slate-400">Saved on this device</p>;
  if (status !== "signedIn" || !user) {
    return (
      <div className="space-y-2 px-3">
        <p className="text-xs text-slate-400">Saved on this device only</p>
        <Button variant="secondary" size="sm" className="w-full" onClick={onSignIn}>
          <UserRound size={15} /> Sign in to sync
        </Button>
      </div>
    );
  }
  const s = SYNC_TEXT[sync];
  return (
    <div className="flex items-center gap-2 px-3">
      <Avatar user={user} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-medium">{user.name || user.email}</p>
        <p className="flex items-center gap-1 text-[11px] text-slate-400">
          <s.icon size={11} className={cx(sync === "syncing" && "animate-spin")} /> {s.text}
        </p>
      </div>
    </div>
  );
}

function Avatar({ user }: { user: { name: string | null; email: string | null; photo: string | null } }) {
  const letter = (user.name || user.email || "?").trim()[0]?.toUpperCase();
  return user.photo ? (
    <img src={user.photo} alt="" referrerPolicy="no-referrer" className="h-8 w-8 shrink-0 rounded-full" />
  ) : (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-100 text-sm font-semibold text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300">
      {letter}
    </span>
  );
}

/** Settings → Account. */
export function AccountSection() {
  const { configured, status, user, sync, signOut } = useAccount();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(false);
  if (!configured) {
    return <p className="text-sm text-slate-500">Your plan is saved on this device. Accounts aren't set up for this app yet.</p>;
  }
  if (status !== "signedIn" || !user) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Your plan is saved on this device only. Sign in with Google or email to keep it safe and use it on your phone and laptop.
        </p>
        <Button onClick={() => setOpen(true)}>
          <UserRound size={16} /> Sign in or create an account
        </Button>
        <SignInDialog open={open} onClose={() => setOpen(false)} />
      </div>
    );
  }
  const s = SYNC_TEXT[sync];
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Avatar user={user} />
        <div className="min-w-0">
          <p className="truncate font-medium">{user.name || user.email}</p>
          {user.name && <p className="truncate text-sm text-slate-500">{user.email}</p>}
        </div>
      </div>
      <p className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
        <s.icon size={15} className={cx(sync === "syncing" && "animate-spin")} /> {s.text}
      </p>
      {confirm ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-600 dark:text-slate-400">Your plan stays in your account but is removed from this device.</span>
          <Button variant="danger" size="sm" onClick={() => void signOut()}>
            <LogOut size={15} /> Sign out
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>
            Cancel
          </Button>
        </div>
      ) : (
        <Button variant="secondary" onClick={() => setConfirm(true)}>
          <LogOut size={16} /> Sign out
        </Button>
      )}
    </div>
  );
}
