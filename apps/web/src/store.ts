import {
  applyAnkiCounts,
  applyResults,
  DEFAULT_SETTINGS,
  withDefaults,
  type BlockedRange,
  type Chunk,
  type EscalationLevel,
  type ISODate,
  type ItemResult,
  type Settings,
  type Subject,
} from "@studymaster/core";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { nextColor } from "./lib/colors";
import { demoData } from "./lib/demo";
import { newId, todayISO } from "./lib/format";
import type { Draft } from "./lib/importer";
import { reconcileDecks, type AnkiReading } from "./lib/ankiSync";

export interface CheckInRecord {
  answer: "yes" | "no";
  at: string;
  items: { title: string; subjectId: string; minutes: number; done: boolean }[];
}

/** A plan change the user agreed to (weekly buffer, extra sessions, …). */
export interface Approval {
  key: string;
  level: EscalationLevel;
  slots: string[];
  examBufferDays: number;
}

export interface AppData {
  setupDone: boolean;
  /** First day of planning. */
  startDate: ISODate;
  subjects: Subject[];
  chunks: Chunk[];
  blocked: BlockedRange[];
  settings: Settings;
  checkIns: Record<ISODate, CheckInRecord>;
  approval?: Approval;
  declinedKey?: string;
  /** Local time for the evening check-in reminder, "HH:MM". */
  checkInTime: string;
  /** Review cards due per subject and date, last read from Anki on a computer. */
  ankiDue?: Record<string, Record<ISODate, number>>;
  /** When the numbers were last read from Anki (ISO timestamp). */
  ankiReadAt?: string;
}

interface Actions {
  finishSetup(): void;
  loadDemo(): void;
  reset(): void;
  importData(data: AppData): void;

  upsertSubject(subject: Subject): void;
  removeSubject(id: string): void;
  upsertChunk(chunk: Chunk): void;
  addChunks(chunks: Chunk[]): void;
  /** Adds the ticked subjects and chunks of a reviewed import. Returns what was added. */
  importDraft(draft: Draft): { subjects: number; chunks: number };
  removeChunk(id: string): void;
  moveChunk(id: string, direction: -1 | 1): void;

  upsertBlocked(range: BlockedRange): void;
  removeBlocked(id: string): void;

  updateSettings(patch: Partial<Settings>): void;
  setCheckInTime(time: string): void;

  /** Takes what was read from Anki: renamed decks, deck ids, card counts, due counts. */
  applyAnkiReading(reading: AnkiReading): void;

  checkIn(date: ISODate, answer: "yes" | "no", results: ItemResult[], record: CheckInRecord["items"]): void;
  undoCheckIn(date: ISODate): void;

  approve(approval: Approval): void;
  decline(key: string): void;
  clearDecline(): void;
}

export type Store = AppData & Actions;

function emptyData(): AppData {
  return {
    setupDone: false,
    startDate: todayISO(),
    subjects: [],
    chunks: [],
    blocked: [],
    settings: DEFAULT_SETTINGS,
    checkIns: {},
    checkInTime: "20:00",
  };
}

/** Undo information for check-ins: the chunks before the check-in. */
const undoStack = new Map<ISODate, Chunk[]>();

export const useStore = create<Store>()(
  persist(
    (set, get) => ({
      ...emptyData(),

      finishSetup: () => set({ setupDone: true, startDate: todayISO() }),
      loadDemo: () => {
        const today = todayISO();
        set({ ...emptyData(), ...demoData(today), setupDone: true, startDate: today });
      },
      reset: () => {
        undoStack.clear();
        set(emptyData());
      },
      importData: (data) => set({ ...emptyData(), ...data, settings: withDefaults(data.settings) }),

      upsertSubject: (subject) =>
        set((s) => ({
          subjects: s.subjects.some((x) => x.id === subject.id)
            ? s.subjects.map((x) => (x.id === subject.id ? relinked(x, subject) : x))
            : [...s.subjects, subject],
        })),
      removeSubject: (id) =>
        set((s) => ({
          subjects: s.subjects.filter((x) => x.id !== id),
          chunks: s.chunks.filter((x) => x.subjectId !== id),
        })),

      upsertChunk: (chunk) =>
        set((s) => ({
          chunks: s.chunks.some((x) => x.id === chunk.id)
            ? s.chunks.map((x) => (x.id === chunk.id ? relinked(x, chunk) : x))
            : [...s.chunks, chunk],
        })),
      addChunks: (chunks) => set((s) => ({ chunks: [...s.chunks, ...chunks] })),
      importDraft: (draft) => {
        const state = get();
        const subjects = [...state.subjects];
        const chunks = [...state.chunks];
        let newSubjects = 0;
        let added = 0;
        for (const d of draft.subjects) {
          const picked = d.chunks.filter((c) => c.include && c.title.trim());
          const links = (d.links ?? []).filter((l) => l.include);
          if (!d.include || (picked.length === 0 && links.length === 0 && !d.ankiDeck)) continue;
          let subjectId = d.existingId && subjects.some((x) => x.id === d.existingId) ? d.existingId : undefined;
          if (!subjectId) {
            subjectId = newId();
            subjects.push({
              id: subjectId,
              name: d.name.trim() || "New subject",
              color: nextColor(subjects.map((x) => x.color)),
              weight: 1,
              examDate: d.examDate,
              ...(d.ankiDeck ? { ankiDeck: d.ankiDeck } : {}),
            });
            newSubjects++;
          } else if (d.ankiDeck) {
            const i = subjects.findIndex((x) => x.id === subjectId);
            subjects[i] = relinked(subjects[i]!, { ...subjects[i]!, ankiDeck: d.ankiDeck });
          }
          for (const l of links) {
            const i = chunks.findIndex((c) => c.id === l.chunkId);
            if (i >= 0) chunks[i] = relinked(chunks[i]!, { ...chunks[i]!, ankiDeck: l.deck, ankiNoDeck: undefined });
          }
          let order = Math.max(0, ...chunks.filter((c) => c.subjectId === subjectId).map((c) => c.order));
          for (const c of picked) {
            chunks.push({
              id: newId(),
              subjectId,
              title: c.title.trim(),
              recordingMinutes: Math.max(0, Math.round(c.recordingMinutes)),
              pages: Math.max(0, Math.round(c.pages)),
              slides: Math.max(0, Math.round(c.slides)),
              order: ++order,
              ...(c.ankiDeck ? { ankiDeck: c.ankiDeck } : {}),
              ...(c.ankiCards !== undefined ? { ankiCards: c.ankiCards } : {}),
            });
            added++;
          }
        }
        set({ subjects, chunks });
        return { subjects: newSubjects, chunks: added };
      },
      removeChunk: (id) => set((s) => ({ chunks: s.chunks.filter((x) => x.id !== id) })),
      moveChunk: (id, direction) =>
        set((s) => {
          const chunk = s.chunks.find((x) => x.id === id);
          if (!chunk) return s;
          const siblings = s.chunks
            .filter((x) => x.subjectId === chunk.subjectId)
            .sort((a, b) => a.order - b.order);
          const i = siblings.findIndex((x) => x.id === id);
          const j = i + direction;
          if (j < 0 || j >= siblings.length) return s;
          [siblings[i], siblings[j]] = [siblings[j]!, siblings[i]!];
          const order = new Map(siblings.map((x, k) => [x.id, k + 1]));
          return { chunks: s.chunks.map((x) => (order.has(x.id) ? { ...x, order: order.get(x.id)! } : x)) };
        }),

      upsertBlocked: (range) =>
        set((s) => ({
          blocked: s.blocked.some((x) => x.id === range.id)
            ? s.blocked.map((x) => (x.id === range.id ? range : x))
            : [...s.blocked, range].sort((a, b) => a.start.localeCompare(b.start)),
        })),
      removeBlocked: (id) => set((s) => ({ blocked: s.blocked.filter((x) => x.id !== id) })),

      applyAnkiReading: (reading) =>
        set((s) => {
          // Re-apply on the current data: it may have changed while Anki was read.
          const fixed = reconcileDecks(s.subjects, s.chunks, reading.ids);
          let chunks = applyAnkiCounts(fixed.chunks, reading.counts, s.settings);
          // Chapters without an own deck in Anki (any more) have no Anki count.
          if (chunks.some((c) => c.ankiCards !== undefined && reading.counts[c.id] === undefined)) {
            chunks = chunks.map((c) => (c.ankiCards !== undefined && reading.counts[c.id] === undefined ? { ...c, ankiCards: undefined } : c));
          }
          const sameDue = JSON.stringify(s.ankiDue ?? {}) === JSON.stringify(reading.due);
          return {
            ...(fixed.subjects !== s.subjects ? { subjects: fixed.subjects } : {}),
            ...(chunks !== s.chunks ? { chunks } : {}),
            ...(sameDue ? {} : { ankiDue: reading.due }),
            ankiReadAt: new Date().toISOString(),
          };
        }),

      updateSettings: (patch) => set((s) => ({ settings: withDefaults({ ...s.settings, ...patch }) })),
      setCheckInTime: (time) => set({ checkInTime: time }),

      checkIn: (date, answer, results, items) => {
        undoStack.set(date, get().chunks);
        set((s) => ({
          chunks: applyResults(s.chunks, results),
          checkIns: { ...s.checkIns, [date]: { answer, at: new Date().toISOString(), items } },
        }));
      },
      undoCheckIn: (date) =>
        set((s) => {
          const { [date]: _removed, ...rest } = s.checkIns;
          const before = undoStack.get(date);
          undoStack.delete(date);
          return { checkIns: rest, ...(before ? { chunks: before } : {}) };
        }),

      approve: (approval) => set({ approval, declinedKey: undefined }),
      decline: (key) => set({ declinedKey: key }),
      clearDecline: () => set({ declinedKey: undefined }),
    }),
    {
      name: "studymaster-v1",
      version: 1,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => {
        const { setupDone, startDate, subjects, chunks, blocked, settings, checkIns, approval, declinedKey, checkInTime, ankiDue, ankiReadAt } = s;
        return { setupDone, startDate, subjects, chunks, blocked, settings, checkIns, approval, declinedKey, checkInTime, ankiDue, ankiReadAt };
      },
      merge: (persisted, current) => {
        const data = (persisted ?? {}) as Partial<AppData>;
        const settings = withDefaults(data.settings);
        // Older versions had a summary step; it's gone now.
        const rates = settings.rates as unknown as Record<string, number>;
        delete rates.summaryPerPage;
        delete rates.summaryPerSlide;
        // Older versions had "sessions per day" instead of a weekly plan.
        delete (settings as unknown as Record<string, unknown>).preferredSessionsPerDay;
        return { ...current, ...data, settings };
      },
    },
  ),
);

export function exportData(): AppData {
  const s = useStore.getState();
  const { setupDone, startDate, subjects, chunks, blocked, settings, checkIns, approval, declinedKey, checkInTime, ankiDue, ankiReadAt } = s;
  return { setupDone, startDate, subjects, chunks, blocked, settings, checkIns, approval, declinedKey, checkInTime, ankiDue, ankiReadAt };
}

/**
 * A changed Anki link forgets the old deck's id and card count, so the next
 * read from Anki doesn't "rename" it back.
 */
function relinked<T extends { ankiDeck?: string; ankiDeckId?: number; ankiCards?: number }>(before: T, after: T): T {
  if (before.ankiDeck === after.ankiDeck || after.ankiDeckId !== before.ankiDeckId) return after;
  return { ...after, ankiDeckId: undefined, ankiCards: undefined };
}
