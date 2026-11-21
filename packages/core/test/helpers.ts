import { dailySessions, withDefaults } from "../src/defaults.js";
import { LEGACY_WORKFLOW, type BlockedRange, type Chunk, type Settings, type StudyState, type Subject } from "../src/types.js";

export function subject(id: string, examDate: string, extra: Partial<Subject> = {}): Subject {
  return { id, name: id.toUpperCase(), weight: 1, examDate, ...extra };
}

export function chunks(subjectId: string, count: number, pages = 16, slides = 0): Chunk[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `${subjectId}-${i + 1}`,
    subjectId,
    title: `${subjectId} ch ${i + 1}`,
    pages,
    slides,
    order: i + 1,
  }));
}

export function state(
  subjects: Subject[],
  chunkList: Chunk[],
  settings: Partial<Settings> = {},
  blocked: BlockedRange[] = [],
): StudyState {
  // Tests plan every day (am1 + pm1) and use the classic study style
  // (watch → read → make cards → study Anki) unless they set their own.
  return { subjects, chunks: chunkList, blocked, settings: withDefaults({ week: dailySessions(2), workflow: [...LEGACY_WORKFLOW], ...settings }) };
}
