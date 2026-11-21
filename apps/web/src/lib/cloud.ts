/**
 * Firebase login + plan storage. Loaded on demand, so people who never sign
 * in don't download it.
 *
 * Each user's plan is one Firestore document: users/{uid} =
 *   { data: JSON string of AppData, updatedAt: ms, device: id, version: 1 }
 * Stored as a string so optional (undefined) fields are fine and the size
 * check in the security rules stays simple.
 */
import type { Auth, User } from "firebase/auth";
import type { Firestore, Unsubscribe } from "firebase/firestore";
import type { AppData } from "../store";
import { emulatorConfig, firebaseConfig, useEmulators } from "./firebaseConfig";

interface Services {
  auth: Auth;
  db: Firestore;
  authMod: typeof import("firebase/auth");
  fsMod: typeof import("firebase/firestore");
}

let services: Promise<Services> | undefined;

export function loadCloud(): Promise<Services> {
  services ??= (async () => {
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([
      import("firebase/app"),
      import("firebase/auth"),
      import("firebase/firestore"),
    ]);
    const app = initializeApp(useEmulators ? emulatorConfig : firebaseConfig);
    const auth = authMod.getAuth(app);
    const db = fsMod.getFirestore(app);
    if (useEmulators) {
      authMod.connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
      fsMod.connectFirestoreEmulator(db, "127.0.0.1", 8080);
    }
    return { auth, db, authMod, fsMod };
  })();
  return services;
}

export interface CloudUser {
  uid: string;
  email: string | null;
  name: string | null;
  photo: string | null;
}

function toUser(u: User): CloudUser {
  return { uid: u.uid, email: u.email, name: u.displayName, photo: u.photoURL };
}

export async function onUserChanged(cb: (user: CloudUser | null) => void): Promise<Unsubscribe> {
  const { auth, authMod } = await loadCloud();
  return authMod.onAuthStateChanged(auth, (u) => cb(u ? toUser(u) : null));
}

export async function signInWithGoogle(): Promise<void> {
  const { auth, authMod } = await loadCloud();
  const provider = new authMod.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    await authMod.signInWithPopup(auth, provider);
  } catch (e) {
    // Some browsers (e.g. installed apps) block popups: fall back to a redirect.
    if (errorCode(e) === "auth/popup-blocked" || errorCode(e) === "auth/operation-not-supported-in-this-environment") {
      await authMod.signInWithRedirect(auth, provider);
      return;
    }
    throw e;
  }
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const { auth, authMod } = await loadCloud();
  await authMod.signInWithEmailAndPassword(auth, email.trim(), password);
}

export async function createAccount(email: string, password: string): Promise<void> {
  const { auth, authMod } = await loadCloud();
  await authMod.createUserWithEmailAndPassword(auth, email.trim(), password);
}

export async function sendReset(email: string): Promise<void> {
  const { auth, authMod } = await loadCloud();
  await authMod.sendPasswordResetEmail(auth, email.trim());
}

export async function signOutCloud(): Promise<void> {
  const { auth, authMod } = await loadCloud();
  await authMod.signOut(auth);
}

export interface RemotePlan {
  data: AppData;
  updatedAt: number;
  device: string;
}

function parse(raw: Record<string, unknown> | undefined): RemotePlan | null {
  if (!raw || typeof raw.data !== "string") return null;
  try {
    return { data: JSON.parse(raw.data) as AppData, updatedAt: Number(raw.updatedAt) || 0, device: String(raw.device ?? "") };
  } catch {
    return null;
  }
}

export async function readPlan(uid: string): Promise<RemotePlan | null> {
  const { db, fsMod } = await loadCloud();
  const snap = await fsMod.getDoc(fsMod.doc(db, "users", uid));
  return snap.exists() ? parse(snap.data()) : null;
}

export async function writePlan(uid: string, data: AppData, updatedAt: number, device: string): Promise<void> {
  const { db, fsMod } = await loadCloud();
  await fsMod.setDoc(fsMod.doc(db, "users", uid), { data: JSON.stringify(data), updatedAt, device, version: 1 });
}

export async function watchPlan(uid: string, cb: (plan: RemotePlan | null) => void): Promise<Unsubscribe> {
  const { db, fsMod } = await loadCloud();
  return fsMod.onSnapshot(fsMod.doc(db, "users", uid), (snap) => cb(snap.exists() ? parse(snap.data()) : null));
}

export function errorCode(e: unknown): string {
  return typeof e === "object" && e && "code" in e ? String((e as { code: unknown }).code) : "";
}

/** Friendly text for Firebase errors; empty string = nothing to show. */
export function errorMessage(e: unknown): string {
  switch (errorCode(e)) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is wrong.";
    case "auth/email-already-in-use":
      return "There's already an account with this email. Sign in instead.";
    case "auth/weak-password":
      return "Use at least 6 characters for the password.";
    case "auth/invalid-email":
      return "That doesn't look like an email address.";
    case "auth/too-many-requests":
      return "Too many tries. Wait a minute and try again.";
    case "auth/network-request-failed":
      return "No connection. Check your internet and try again.";
    case "auth/unauthorized-domain":
      return "Sign-in isn't allowed on this address yet (Firebase → Authentication → Authorized domains).";
    default:
      return "Something went wrong. Please try again.";
  }
}
