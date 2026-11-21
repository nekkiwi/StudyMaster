import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

/**
 * Settings that belong to this device, not to the account: they are never
 * synced. E.g. desktop Anki is connected on one computer only.
 */
interface DeviceState {
  ankiConnected: boolean;
  setAnkiConnected(value: boolean): void;
  /** This device studies Anki on AnkiWeb in the browser (no Anki app). */
  ankiWeb: boolean;
  setAnkiWeb(value: boolean): void;
}

export const useDevice = create<DeviceState>()(
  persist(
    (set) => ({
      ankiConnected: false,
      setAnkiConnected: (ankiConnected) => set({ ankiConnected }),
      ankiWeb: false,
      setAnkiWeb: (ankiWeb) => set({ ankiWeb }),
    }),
    { name: "studymaster-device", storage: createJSONStorage(() => localStorage) },
  ),
);
