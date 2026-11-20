import { addDays, type BlockedRange, type Chunk, type ISODate, type Subject } from "@studymaster/core";
import { SUBJECT_COLORS } from "./colors";

/** Example data relative to today, so the demo always looks current. */
export function demoData(today: ISODate): { subjects: Subject[]; chunks: Chunk[]; blocked: BlockedRange[] } {
  const subjects: Subject[] = [
    { id: "bio", name: "Biology", color: SUBJECT_COLORS[1], weight: 1.2, examDate: addDays(today, 24) },
    { id: "chem", name: "Chemistry", color: SUBJECT_COLORS[0], weight: 1.5, examDate: addDays(today, 25), examHalf: "pm" },
    { id: "psy", name: "Psychology", color: SUBJECT_COLORS[3], weight: 0.8, examDate: addDays(today, 29) },
  ];
  // Lectures: a 60–90 min recording plus the slide deck or script.
  // Psychology is learned from the book only (no recordings).
  const chunks: Chunk[] = [
    ...Array.from({ length: 8 }, (_, i): Chunk => ({
      id: `bio-${i + 1}`, subjectId: "bio", title: `Lecture ${i + 1}`, recordingMinutes: 90, pages: 0, slides: 35 + i * 3, order: i + 1,
    })),
    ...Array.from({ length: 6 }, (_, i): Chunk => ({
      id: `chem-${i + 1}`, subjectId: "chem", title: `Lecture ${i + 1}`, recordingMinutes: 60, pages: 12 + i, slides: 25, order: i + 1,
    })),
    ...Array.from({ length: 5 }, (_, i): Chunk => ({
      id: `psy-${i + 1}`, subjectId: "psy", title: `Ch ${i + 1}`, pages: 24 + i * 2, slides: 0, order: i + 1,
    })),
  ];
  const blocked: BlockedRange[] = [
    { id: "trip", start: addDays(today, 11), end: addDays(today, 13), reason: "vacation", note: "Weekend trip" },
  ];
  return { subjects, chunks, blocked };
}
