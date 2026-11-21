/**
 * Accounts and sync.
 *
 * - The app works without an account (data on this device only).
 * - Signing in (Google or email + password) stores the plan in the user's
 *   own Firestore document and keeps every device in sync (last write wins).
 * - On a device that already has a plan, signing in into an account that
 *   also has one asks which plan to keep.
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

interface AccountState {
  configured: boolean;
  status: "idle" | "loading" | "signedOut" | "signedIn";
  user?: CloudUser;
  sync: SyncState;
  /** Both this device and the account have a plan: the user picks one. */
  choice?: { remote: RemotePlan; local: AppData };
  start(): Promise<void>;
  resolveChoice(keep: "account" | "device"): Promise<void>;
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

  resolveChoice: async (keep) => {
    const { choice, user } = get();
    if (!choice || !user) return;
    set({ choice: undefined });
    if (keep === "account") applyRemote(choice.remote);
    else await upload(user.uid);
    writeMeta({ ...readMeta(), owner: user.uid });
    await startWatching(user.uid);
  },

  signOut: async () => {
    unwatch?.();
    unwatch = undefined;
    clearTimeout(uploadTimer);
    await signOutCloud();
    applyingRemote = true;
    useStore.getState().reset();
    applyingRemote = false;
    writeMeta({});
    set({ status: "signedOut", user: undefined, sync: "off", choice: undefined });
  },
}));

async function handleUser(user: CloudUser | null): Promise<void> {
  const set = useAccount.setState;
  if (!user) {
    unwatch?.();
    unwatch = undefined;
    set({ status: "signedOut", user: undefined, sync: "off" });
    return;
  }
  set({ status: "signedIn", user, sync: "syncing" });
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
    } else if (!hasLocalPlan) {
      applyRemote(remote);
      writeMeta({ ...readMeta(), owner: user.uid });
    } else {
      set({ choice: { remote, local }, sync: "syncing" });
      return; // wait for resolveChoice
    }
    await startWatching(user.uid);
  } catch (e) {
    console.warn("Sync failed", errorMessage(e));
    set({ sync: "offline" });
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
const DATA_KEYS = ["setupDone", "startDate", "subjects", "chunks", "blocked", "settings", "checkIns", "approval", "declinedKey", "checkInTime"] as const;
useStore.subscribe((state, prev) => {
  if (applyingRemote || !DATA_KEYS.some((k) => state[k] !== prev[k])) return;
  writeMeta({ ...readMeta(), localAt: Date.now() });
  const { status, user, choice } = useAccount.getState();
  if (status !== "signedIn" || !user || choice) return;
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
