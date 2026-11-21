/** Google Calendar API (read-only), called straight from the browser with the user's token. */
import type { ISODate } from "@studymaster/core";
import { googleToEvents, type CalEvent, type GoogleEvent } from "./calendar";

const API = "https://www.googleapis.com/calendar/v3";

export interface GoogleCalendar {
  id: string;
  summary: string;
  primary?: boolean;
  backgroundColor?: string;
}

async function get<T>(token: string, path: string): Promise<T> {
  const res = await fetch(`${API}${path}`, { headers: { authorization: `Bearer ${token}` } });
  if (res.status === 401) throw new Error("Google access expired – press Update to connect again.");
  if (res.status === 403) {
    throw new Error("Google refused calendar access. The Google Calendar API may not be switched on for StudyMaster yet (see docs/HOSTING.md).");
  }
  if (!res.ok) throw new Error(`Google Calendar answered with an error (${res.status}).`);
  return (await res.json()) as T;
}

export async function listGoogleCalendars(token: string): Promise<GoogleCalendar[]> {
  const out: GoogleCalendar[] = [];
  let page: string | undefined;
  do {
    const body = await get<{ items?: GoogleCalendar[]; nextPageToken?: string }>(
      token,
      `/users/me/calendarList?minAccessRole=reader&maxResults=250${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`,
    );
    out.push(...(body.items ?? []));
    page = body.nextPageToken;
  } while (page);
  return out.sort((a, b) => Number(!!b.primary) - Number(!!a.primary) || a.summary.localeCompare(b.summary));
}

/** Events of one calendar in the period, repeating events already expanded by Google. */
export async function googleEvents(token: string, calendarId: string, from: ISODate, to: ISODate): Promise<CalEvent[]> {
  const items: GoogleEvent[] = [];
  let page: string | undefined;
  const timeMin = new Date(`${from}T00:00:00`).toISOString();
  const timeMax = new Date(`${to}T23:59:59`).toISOString();
  do {
    const body = await get<{ items?: GoogleEvent[]; nextPageToken?: string }>(
      token,
      `/calendars/${encodeURIComponent(calendarId)}/events?singleEvents=true&orderBy=startTime&maxResults=2500&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}${page ? `&pageToken=${encodeURIComponent(page)}` : ""}`,
    );
    items.push(...(body.items ?? []));
    page = body.nextPageToken;
  } while (page && items.length < 10_000);
  return googleToEvents(items, from, to);
}
