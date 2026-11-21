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
  apiKey: "AIzaSyBUHNvm-8QUKD5JaRi2QIIftWBPTQ9Powo",
  authDomain: "studymaster-caa36.firebaseapp.com",
  projectId: "studymaster-caa36",
  storageBucket: "studymaster-caa36.firebasestorage.app",
  messagingSenderId: "297970173514",
  appId: "1:297970173514:web:73c7f6b85a4b3f0d4e48b3",
};

/**
 * "Continue with Apple". Needs an Apple Developer account ($99/year) and the
 * Apple provider enabled in Firebase (see docs/HOSTING.md). Off until then.
 */
export const appleSignInEnabled = import.meta.env.VITE_APPLE_SIGN_IN === "1" || false;

/** `VITE_FIREBASE_EMULATORS=1 npm run dev` uses local Firebase emulators. */
export const useEmulators = import.meta.env.VITE_FIREBASE_EMULATORS === "1";

export const emulatorConfig = {
  apiKey: "demo-key",
  authDomain: "demo-studymaster.firebaseapp.com",
  projectId: "demo-studymaster",
  appId: "demo-app",
};

export const isCloudConfigured = useEmulators || firebaseConfig.apiKey !== "";
