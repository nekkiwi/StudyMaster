/** Calendar links and AI timetables go through our Worker (signed-in users). */
import { idToken } from "./cloud";
import type { WeeklyClass } from "./calendar";

async function post<T>(path: string, payload: unknown): Promise<T> {
  const token = await idToken();
  if (!token) throw new Error("Please sign in first.");
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error("You seem to be offline.");
  }
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error ?? "That didn't work. Please try again.");
  return body;
}

/** The ICS text behind a calendar link. */
export async function fetchCalendarLink(url: string): Promise<string> {
  return (await post<{ ics: string }>("/api/ics", { url })).ics;
}

export interface AiTimetable {
  classes: WeeklyClass[];
  startDate: string | null;
  endDate: string | null;
}

const toBase64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** Weekly classes from a timetable PDF or photo, read by AI. */
export async function readTimetableFile(file: File): Promise<AiTimetable> {
  const mediaType = file.type || (file.name.toLowerCase().endsWith(".pdf") ? "application/pdf" : "image/png");
  return post<AiTimetable>("/api/timetable", { data: await toBase64(file), mediaType });
}
