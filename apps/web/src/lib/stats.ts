import {
  addDays,
  cardsMade,
  estimatedCards,
  remainingMinutes,
  totalMinutes,
  type ISODate,
  type StudyState,
  type Subject,
} from "@studymaster/core";
import type { CheckInRecord } from "../store";

export interface SubjectProgress {
  subject: Subject;
  totalMinutes: number;
  remainingMinutes: number;
  fraction: number;
  chunks: number;
  chunksDone: number;
  cardsMade: number;
  cardsEstimated: number;
}

export function subjectProgress(state: StudyState): SubjectProgress[] {
  return state.subjects
    .slice()
    .sort((a, b) => a.examDate.localeCompare(b.examDate))
    .map((subject) => {
      const chunks = state.chunks.filter((c) => c.subjectId === subject.id);
      const total = chunks.reduce((a, c) => a + totalMinutes(c, subject, state.settings), 0);
      const remaining = chunks.reduce((a, c) => a + remainingMinutes(c, subject, state.settings), 0);
      return {
        subject,
        totalMinutes: total,
        remainingMinutes: remaining,
        fraction: total > 0 ? 1 - remaining / total : 0,
        chunks: chunks.length,
        chunksDone: chunks.filter((c) => remainingMinutes(c, subject, state.settings) < 0.5).length,
        cardsMade: Math.round(chunks.reduce((a, c) => a + cardsMade(c, state.settings), 0)),
        cardsEstimated: chunks.reduce((a, c) => a + estimatedCards(c, state.settings), 0),
      };
    });
}

/** Check-ins of the last `days` days: how many were "yes". */
export function recentCheckIns(checkIns: Record<ISODate, CheckInRecord>, today: ISODate, days = 7) {
  const start = addDays(today, -days + 1);
  const recent = Object.entries(checkIns).filter(([d]) => d >= start && d <= today);
  return { yes: recent.filter(([, r]) => r.answer === "yes").length, total: recent.length };
}
