import { isISODate } from "./dates.js";
import { ACTIVITIES, WEIGHTS, type StudyState } from "./types.js";

/** Returns human-readable problems; an empty list means the input is fine. */
export function validateState(state: StudyState): string[] {
  const errors: string[] = [];
  const s = state.settings;

  const subjectIds = new Set<string>();
  for (const subject of state.subjects) {
    if (subjectIds.has(subject.id)) errors.push(`Duplicate subject id "${subject.id}".`);
    subjectIds.add(subject.id);
    if (!WEIGHTS.includes(subject.weight)) {
      errors.push(`${subject.name}: weight must be one of ${WEIGHTS.join(", ")}.`);
    }
    if (!isISODate(subject.examDate)) errors.push(`${subject.name}: invalid exam date.`);
  }

  const chunkIds = new Set<string>();
  for (const chunk of state.chunks) {
    if (chunkIds.has(chunk.id)) errors.push(`Duplicate chunk id "${chunk.id}".`);
    chunkIds.add(chunk.id);
    if (!subjectIds.has(chunk.subjectId)) errors.push(`${chunk.title}: unknown subject.`);
    const recording = chunk.recordingMinutes ?? 0;
    if (chunk.pages < 0 || chunk.slides < 0 || recording < 0) {
      errors.push(`${chunk.title}: pages, slides and recording can't be negative.`);
    }
    if (chunk.pages === 0 && chunk.slides === 0 && recording === 0) {
      errors.push(`${chunk.title}: needs a recording, pages or slides.`);
    }
  }

  for (const range of state.blocked) {
    if (!isISODate(range.start) || !isISODate(range.end)) {
      errors.push(`Blocked range "${range.id}": invalid date.`);
    } else if (range.end < range.start) {
      errors.push(`Blocked range "${range.id}": ends before it starts.`);
    }
  }

  const halves = [0, 1, 2];
  if (s.week.length !== 7 || s.week.some((d) => !halves.includes(d.am) || !halves.includes(d.pm))) {
    errors.push("The weekly plan needs 7 days with 0, 1 or 2 sessions per half-day.");
  } else if (s.week.every((d) => d.am + d.pm === 0)) {
    errors.push("Pick at least one half-day per week to study.");
  }
  if (s.maxSessionsPerDay < 1 || s.maxSessionsPerDay > 4) {
    errors.push("Max sessions per day must be between 1 and 4.");
  }
  if (s.sessionMinutes < 60 || s.sessionMinutes > 240) {
    errors.push("A session should be between 1 and 4 hours.");
  }
  if (s.maxChunksPerSession < 1) errors.push("A session needs room for at least 1 lecture or chapter.");
  if (s.examBufferDays < 0) errors.push("Exam buffer days can't be negative.");
  if (s.pacing !== "even" && s.pacing !== "early") errors.push('Pacing must be "even" or "early".');
  if (s.rates.recordingFactor <= 0) errors.push("Recording factor must be above 0.");
  if (s.anki.secondsPerNewCard < 0) errors.push("Seconds per new card can't be negative.");
  if (s.defaultRecordingMinutes < 0) errors.push("Default recording length can't be negative.");
  const when = s.weeklyBuffer.when;
  if (when !== "auto" && (when.weekday < 0 || when.weekday > 6)) {
    errors.push("Weekly buffer weekday must be 0 (Sunday) to 6 (Saturday).");
  }
  for (const [slot, t] of Object.entries(s.slotTimes)) {
    if (!(t.start >= 0 && t.end <= 24 * 60 && t.start < t.end)) errors.push(`Session time for ${slot} is invalid.`);
  }
  if (!["never", "needed", "free"].includes(s.mixSubjects)) errors.push("Subjects per session must be never, needed or free.");
  if (!Array.isArray(s.workflow) || s.workflow.length === 0) errors.push("Pick at least one way to study.");
  else if (s.workflow.some((a) => !ACTIVITIES.includes(a))) errors.push("The study style contains an unknown step.");
  for (const [subjectId, days] of Object.entries(state.ankiDue ?? {})) {
    for (const [date, n] of Object.entries(days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !(n >= 0)) errors.push(`Invalid Anki due count for ${subjectId} on ${date}.`);
    }
  }
  return errors;
}
