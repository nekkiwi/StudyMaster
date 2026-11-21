/**
 * Accounts and sync.
 *
 * - The app works without an account (data on this device only).
 * - Signing in (Google or email + password) stores the plan in the user's
 *   own Firestore document and keeps every device in sync (last write wins).
 * - Signing in is silent: if the account has a plan, it's loaded. A plan
 *   this device had before (used without an account) is kept as a backup
 *   that can be restored in Settings. If the account is empty, this
 *   device's plan is uploaded.
 * - Signing out removes the plan from this device (shared devices stay private).
 */
import { create } from "zustand";
import type { Unsubscribe } from "firebase/firestore";
import {
  errorMessage,
  onUserChanged,
  readPlan,
  signOutCloud,
  watchPlan,
  writePlan,
  type CloudUser,
  type RemotePlan,
} from "./lib/cloud";
import { isCloudConfigured } from "./lib/firebaseConfig";
import { exportData, useStore, type AppData } from "./store";

const META_KEY = "studymaster-sync";
const BACKUP_KEY = "studymaster-backup";
const DEVICE_KEY = "studymaster-device-id";
const UPLOAD_DELAY = 1500;

interface SyncMeta {
  /** Account whose plan is on this device. */
  owner?: string;
  /** Last local change (ms). */
  localAt?: number;
  /** updatedAt of the version last uploaded or downloaded. */
  syncedAt?: number;
}

function readMeta(): SyncMeta {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) ?? "{}") as SyncMeta;
  } catch {
    return {};
  }
}

function writeMeta(meta: SyncMeta): void {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(meta));
  } catch {
    /* storage unavailable: sync still works for this session */
  }
}

function deviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) localStorage.setItem(DEVICE_KEY, (id = Math.random().toString(36).slice(2) + Date.now().toString(36)));
    return id;
  } catch {
    return "unknown";
  }
}

export type SyncState = "off" | "syncing" | "synced" | "offline";

/** A plan this device had before signing in, replaced by the account's plan. */
export interface DeviceBackup {
  savedAt: number;
  data: AppData;
}

export function readBackup(): DeviceBackup | null {
  try {
    const raw = localStorage.getItem(BACKUP_KEY);
    return raw ? (JSON.parse(raw) as DeviceBackup) : null;
  } catch {
    return null;
  }
}

function writeBackup(data: AppData | null): void {
  try {
    if (data) localStorage.setItem(BACKUP_KEY, JSON.stringify({ savedAt: Date.now(), data }));
    else localStorage.removeItem(BACKUP_KEY);
  } catch {
    /* ignore */
  }
  useAccount.setState({ hasBackup: !!data });
}

interface AccountState {
  configured: boolean;
  status: "idle" | "loading" | "signedOut" | "signedIn";
  user?: CloudUser;
  sync: SyncState;
  /** The first sync after signing in is done (the account's plan is here). */
  initialSynced: boolean;
  /** This device's plan from before signing in is kept and can be restored. */
  hasBackup: boolean;
  start(): Promise<void>;
  restoreBackup(): Promise<void>;
  dismissBackup(): void;
  signOut(): Promise<void>;
}

let started: Promise<void> | undefined;
let unwatch: Unsubscribe | undefined;
let uploadTimer: ReturnType<typeof setTimeout> | undefined;
let applyingRemote = false;

export const useAccount = create<AccountState>()((set, get) => ({
  configured: isCloudConfigured,
  status: "idle",
  sync: "off",
  initialSynced: false,
  hasBackup: !!readBackup(),

  start: () => {
    if (!isCloudConfigured) return Promise.resolve();
    started ??= (async () => {
      set({ status: "loading" });
      await onUserChanged((user) => {
        void handleUser(user);
      });
    })();
    return started;
  },

  restoreBackup: async () => {
    const backup = readBackup();
    const { user } = get();
    if (!backup) return;
    applyingRemote = true;
    useStore.getState().importData(backup.data);
    applyingRemote = false;
    writeBackup(null);
    if (user) await upload(user.uid);
  },

  dismissBackup: () => writeBackup(null),

  signOut: async () => {
    unwatch?.();
    unwatch = undefined;
    clearTimeout(uploadTimer);
    await signOutCloud();
    applyingRemote = true;
    useStore.getState().reset();
    applyingRemote = false;
    writeMeta({});
    writeBackup(null);
    set({ status: "signedOut", user: undefined, sync: "off", initialSynced: false });
  },
}));

async function handleUser(user: CloudUser | null): Promise<void> {
  const set = useAccount.setState;
  if (!user) {
    unwatch?.();
    unwatch = undefined;
    set({ status: "signedOut", user: undefined, sync: "off", initialSynced: false });
    return;
  }
  set({ status: "signedIn", user, sync: "syncing", initialSynced: false });
  try {
    const remote = await readPlan(user.uid);
    const local = exportData();
    const meta = readMeta();
    const hasLocalPlan = local.setupDone || local.subjects.length > 0;

    if (!remote) {
      if (hasLocalPlan) await upload(user.uid);
      writeMeta({ ...readMeta(), owner: user.uid });
    } else if (meta.owner === user.uid) {
      // Same account as before: keep whichever changed last.
      if ((meta.localAt ?? 0) > remote.updatedAt) await upload(user.uid);
      else applyRemote(remote);
    } else {
      // The account's plan wins. Keep this device's own plan as a backup.
      if (hasLocalPlan) writeBackup(local);
      applyRemote(remote);
      writeMeta({ ...readMeta(), owner: user.uid });
    }
    await startWatching(user.uid);
  } catch (e) {
    console.warn("Sync failed", errorMessage(e));
    set({ sync: "offline" });
  } finally {
    set({ initialSynced: true });
  }
}

function applyRemote(remote: RemotePlan): void {
  applyingRemote = true;
  useStore.getState().importData(remote.data);
  applyingRemote = false;
  writeMeta({ ...readMeta(), localAt: remote.updatedAt, syncedAt: remote.updatedAt });
  useAccount.setState({ sync: "synced" });
}

async function upload(uid: string): Promise<void> {
  const updatedAt = Date.now();
  useAccount.setState({ sync: "syncing" });
  await writePlan(uid, exportData(), updatedAt, deviceId());
  writeMeta({ ...readMeta(), syncedAt: updatedAt, localAt: updatedAt });
  useAccount.setState({ sync: "synced" });
}

async function startWatching(uid: string): Promise<void> {
  unwatch?.();
  unwatch = await watchPlan(uid, (remote) => {
    // Changes from other devices only; our own writes come back too.
    if (!remote || remote.device === deviceId()) return;
    if (remote.updatedAt > (readMeta().syncedAt ?? 0)) applyRemote(remote);
  });
  useAccount.setState({ sync: "synced" });
}

/** Every local change is uploaded shortly after (when signed in). */
const DATA_KEYS = ["setupDone", "startDate", "subjects", "chunks", "blocked", "settings", "checkIns", "approval", "declinedKey", "checkInTime", "ankiDue", "calendars", "calendarEvents"] as const;
useStore.subscribe((state, prev) => {
  if (applyingRemote || !DATA_KEYS.some((k) => state[k] !== prev[k])) return;
  writeMeta({ ...readMeta(), localAt: Date.now() });
  const { status, user, initialSynced } = useAccount.getState();
  if (status !== "signedIn" || !user || !initialSynced) return;
  useAccount.setState({ sync: "syncing" });
  clearTimeout(uploadTimer);
  uploadTimer = setTimeout(() => {
    upload(user.uid).catch(() => useAccount.setState({ sync: "offline" }));
  }, UPLOAD_DELAY);
});

/** Remember that this device signed in, so Firebase loads on start next time. */
const SIGNED_IN_KEY = "studymaster-signed-in";
useAccount.subscribe((s) => {
  try {
    if (s.status === "signedIn") localStorage.setItem(SIGNED_IN_KEY, "1");
    if (s.status === "signedOut") localStorage.removeItem(SIGNED_IN_KEY);
  } catch {
    /* ignore */
  }
});

export function wasSignedIn(): boolean {
  try {
    return localStorage.getItem(SIGNED_IN_KEY) === "1";
  } catch {
    return false;
  }
}
