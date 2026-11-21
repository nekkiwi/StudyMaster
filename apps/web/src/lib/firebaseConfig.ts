/**
 * Firebase project settings for login and sync.
 *
 * These values are public by design – every Firebase web app ships them.
 * Access is protected by Firebase Auth and the Firestore rules in
 * /firestore.rules, not by keeping these secret. (Real secrets never go here.)
 *
 * Leave apiKey empty to run without accounts: the sign-in UI is then hidden.
 */
export const firebaseConfig = {
  apiKey: "",
  authDomain: "",
  projectId: "",
  storageBucket: "",
  messagingSenderId: "",
  appId: "",
};

/** `VITE_FIREBASE_EMULATORS=1 npm run dev` uses local Firebase emulators. */
export const useEmulators = import.meta.env.VITE_FIREBASE_EMULATORS === "1";

export const emulatorConfig = {
  apiKey: "demo-key",
  authDomain: "demo-studymaster.firebaseapp.com",
  projectId: "demo-studymaster",
  appId: "demo-app",
};

export const isCloudConfigured = useEmulators || firebaseConfig.apiKey !== "";
