import type { StepKey } from "@studymaster/core";
import { BookOpen, PenLine, Video } from "lucide-react";

/** The three steps of a lecture, in order. Studying Anki is a separate item. */
export const STEP_META: { key: StepKey; label: string; done: string; icon: typeof BookOpen }[] = [
  { key: "watch", label: "Watch", done: "Watched", icon: Video },
  { key: "read", label: "Read", done: "Read", icon: BookOpen },
  { key: "cards", label: "Write cards", done: "Cards written", icon: PenLine },
];
