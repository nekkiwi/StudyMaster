import { dailySessions, withDefaults } from "../src/defaults.js";
import type { BlockedRange, Chunk, Settings, StudyState, Subject } from "../src/types.js";

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
  // Tests plan every day (am1 + pm1) unless they set their own week.
  return { subjects, chunks: chunkList, blocked, settings: withDefaults({ week: dailySessions(2), ...settings }) };
}
