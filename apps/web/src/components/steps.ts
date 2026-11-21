import type { Activity, StepKey } from "@studymaster/core";
import { BookCheck, BookOpen, FileText, Layers, PenLine, Video } from "lucide-react";

/** Everything a study style can contain, with labels for the UI. */
export const ACTIVITY_META: Record<Activity, { title: string; label: string; done: string; hint: string; icon: typeof BookOpen }> = {
  watch: { title: "Watch the lecture", label: "Watch", done: "Watched", hint: "Lecture recordings", icon: Video },
  read: { title: "Read chapters & slides", label: "Read", done: "Read", hint: "Book chapters, scripts, slide decks", icon: BookOpen },
  summary: { title: "Write a summary", label: "Summary", done: "Summary written", hint: "Your own notes per chapter", icon: FileText },
  cards: { title: "Make Anki cards", label: "Make cards", done: "Cards made", hint: "Flashcards per chapter", icon: PenLine },
  anki: { title: "Study Anki", label: "Anki", done: "Anki done", hint: "Learn new cards, review old ones – every session", icon: Layers },
  revise: { title: "Study the summary", label: "Study summary", done: "Summary studied", hint: "Go through your summary again", icon: BookCheck },
};

/** The steps of a chunk (everything but studying Anki), with labels. */
export const STEP_META: { key: StepKey; label: string; done: string; icon: typeof BookOpen }[] = (
  ["watch", "read", "summary", "cards", "revise"] as const
).map((key) => ({ key, label: ACTIVITY_META[key].label, done: ACTIVITY_META[key].done, icon: ACTIVITY_META[key].icon }));

/** The chunk steps of a study style, in its order. */
export function stepsInOrder(workflow: Activity[]): typeof STEP_META {
  return workflow.filter((a): a is StepKey => a !== "anki").map((k) => STEP_META.find((m) => m.key === k)!);
}
