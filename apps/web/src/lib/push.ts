/**
 * Evening check-in reminders (Web Push). The Worker keeps a scheduler per
 * user; this device subscribes and keeps the scheduler up to date with the
 * check-in time, time zone, planned study days and the last check-in.
 */
import { idToken } from "./cloud";
import { useDevice } from "./device";

export type PushSupport = "ok" | "unsupported" | "install-first" | "denied";

const isIos = () => typeof navigator !== "undefined" && /iphone|ipad|ipod/i.test(navigator.userAgent);
const standalone = () =>
  typeof window !== "undefined" &&
  (window.matchMedia?.("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true);

/** Whether reminders can work here. iPhones need StudyMaster on the home screen first. */
export function pushSupport(): PushSupport {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  if (!("PushManager" in window) || !("Notification" in window)) return isIos() && !standalone() ? "install-first" : "unsupported";
  if (Notification.permission === "denied") return "denied";
  return "ok";
}

async function api(path: string, payload?: unknown): Promise<unknown> {
  const token = path === "/api/push/key" ? null : await idToken();
  if (path !== "/api/push/key" && !token) throw new Error("Please sign in to get reminders.");
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(payload ?? {}),
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(body.error ?? "Reminders didn't work. Please try again.");
  return body;
}

const keyBytes = (b64: string) => Uint8Array.from(atob(b64.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

export interface ReminderInfo {
  time: string;
  planDates: string[];
  lastCheckIn?: string;
}

/** Asks for permission, subscribes this device and registers it. */
export async function enableReminders(info: ReminderInfo): Promise<void> {
  const support = pushSupport();
  if (support === "install-first") throw new Error("On iPhone, add StudyMaster to your Home Screen first (Share → Add to Home Screen), then open it from there.");
  if (support === "denied") throw new Error("Notifications are blocked for StudyMaster – allow them in your browser or phone settings.");
  if (support !== "ok") throw new Error("This browser can't show reminders.");
  if ((await Notification.requestPermission()) !== "granted") throw new Error("Reminders need permission to show notifications.");
  const { publicKey } = (await api("/api/push/key")) as { publicKey: string };
  const registration = await navigator.serviceWorker.ready;
  const subscription =
    (await registration.pushManager.getSubscription()) ??
    (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) }));
  const json = subscription.toJSON() as { endpoint: string; keys?: Record<string, string> };
  await api("/api/push", { subscription: json, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...info });
  useDevice.getState().setPushEndpoint(json.endpoint);
}

export async function disableReminders(): Promise<void> {
  const endpoint = useDevice.getState().pushEndpoint;
  useDevice.getState().setPushEndpoint(undefined);
  try {
    const registration = await navigator.serviceWorker.ready;
    await (await registration.pushManager.getSubscription())?.unsubscribe();
  } catch {
    // already gone
  }
  if (endpoint) await api("/api/push", { removeEndpoint: endpoint }).catch(() => undefined);
}

/** Tells the scheduler about changes (time, planned days, check-ins). */
export async function syncReminders(info: ReminderInfo): Promise<void> {
  if (!useDevice.getState().pushEndpoint) return;
  await api("/api/push", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, ...info });
}
