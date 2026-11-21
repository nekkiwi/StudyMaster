/**
 * Calendars & timetable: university calendars (and others) block study
 * sessions, so the plan goes around classes. Sources: calendar links (ICS),
 * .ics files, and timetable PDFs/photos read by AI.
 */
import { CalendarDays, FileUp, GraduationCap, Link2, Loader2, Plus, RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAccount } from "../account";
import {
  calendarRange,
  parseIcs,
  toClock,
  toMinutes,
  weeklyToEvents,
  type CalendarSource,
  type CalEvent,
  type WeeklyClass,
} from "../lib/calendar";
import { fetchCalendarLink, readTimetableFile, type AiTimetable } from "../lib/calendarApi";
import { connectGoogleCalendar, googleCalendarToken } from "../lib/cloud";
import { googleEvents, listGoogleCalendars, type GoogleCalendar } from "../lib/googleCalendar";
import { formatShort, newId, todayISO } from "../lib/format";
import { useStore } from "../store";
import { toast } from "./toast";
import { Badge, Button, cx, Field, Modal, Segmented, TextInput, Toggle } from "./ui";

// Stable empty defaults: a new [] / {} in a store selector re-renders forever.
const NO_LIST: never[] = [];
const NO_MAP: Record<string, never> = {};

const WEEKDAY = ["", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function useRange() {
  const subjects = useStore((s) => s.subjects);
  const last = subjects.map((s) => s.examDate).sort().pop();
  return calendarRange(todayISO(), last);
}

/**
 * Reads a calendar's events again (links from the internet, Google via its
 * API, timetables repeated for the current period). Google needs a token:
 * `interactive` may open the Google popup (only from a tap).
 */
export async function refreshCalendar(
  source: CalendarSource,
  range: { from: string; to: string },
  interactive = false,
): Promise<CalEvent[] | undefined> {
  if (source.kind === "link" && source.url) return parseIcs(await fetchCalendarLink(source.url), range.from, range.to);
  if (source.kind === "google" && source.googleId) {
    const token = googleCalendarToken() ?? (interactive ? await connectGoogleCalendar() : undefined);
    return token ? googleEvents(token, source.googleId, range.from, range.to) : undefined;
  }
  if (source.kind === "timetable" && source.classes) {
    const from = source.classesFrom && source.classesFrom > range.from ? source.classesFrom : range.from;
    const to = source.classesUntil && source.classesUntil < range.to ? source.classesUntil : range.to;
    return weeklyToEvents(source.classes, from, to);
  }
  return undefined;
}

/** Keeps calendar links up to date (every 6 hours while the app is open). Mounted once in App. */
export function CalendarAutoRefresh() {
  const signedIn = useAccount((s) => s.status === "signedIn");
  const range = useRange();
  const key = `${range.from}|${range.to}`;
  useEffect(() => {
    const run = async () => {
      const { calendars = [], saveCalendar } = useStore.getState();
      for (const c of calendars) {
        const stale = Date.now() - new Date(c.updatedAt).getTime() > 6 * 3600_000;
        if (c.kind === "link" && (!signedIn || !stale)) continue;
        if (c.kind === "file") continue;
        try {
          const events = await refreshCalendar(c, range);
          if (events) saveCalendar({ ...c, updatedAt: new Date().toISOString() }, events);
        } catch {
          // Try again next time.
        }
      }
    };
    void run();
    const timer = setInterval(run, 6 * 3600_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signedIn, key]);
  return null;
}

/** Settings / onboarding section: the list of calendars, session times, "Add calendar". */
export function CalendarSection({ compact }: { compact?: boolean }) {
  const calendars = (useStore((s) => s.calendars) ?? NO_LIST);
  const events = (useStore((s) => s.calendarEvents) ?? NO_MAP);
  const save = useStore((s) => s.saveCalendar);
  const remove = useStore((s) => s.removeCalendar);
  const range = useRange();
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const today = todayISO();

  const refresh = async (c: CalendarSource) => {
    setBusy(c.id);
    try {
      const ev = await refreshCalendar(c, range, true);
      if (ev) save({ ...c, updatedAt: new Date().toISOString() }, ev);
      toast(`Updated “${c.name}”.`, { tone: "success" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't update the calendar.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="space-y-4">
      {calendars.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-400">
          Add your university timetable and StudyMaster plans around your classes – sessions that clash with a class are skipped, and the plan uses
          your free time instead. Works with Google Calendar, Outlook, Apple iCloud, university portals, .ics files and timetable PDFs or photos.
        </p>
      ) : (
        <ul className="space-y-2">
          {calendars.map((c) => {
            const list = events[c.id] ?? [];
            const next = list.find((e) => e.date >= today);
            return (
              <li key={c.id} className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <div className="flex flex-wrap items-center gap-2">
                  {c.university ? <GraduationCap size={16} className="text-indigo-600" /> : <CalendarDays size={16} className="text-slate-500" />}
                  <span className="min-w-0 flex-1 truncate font-medium">{c.name}</span>
                  {c.university && <Badge tone="indigo">University</Badge>}
                  <Badge>{c.kind === "link" ? "Link" : c.kind === "file" ? "File" : c.kind === "google" ? "Google" : "Timetable"}</Badge>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  {list.length} event{list.length === 1 ? "" : "s"} in your planning period
                  {next ? ` · next: ${WEEKDAY[((new Date(`${next.date}T12:00:00`).getDay() + 6) % 7) + 1]} ${formatShort(next.date)} ${toClock(next.start)} ${next.title}` : ""}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <div className="min-w-0 flex-1">
                    <Toggle checked={c.block} onChange={(block) => save({ ...c, block })} label="Plan around these events" />
                  </div>
                  <span className="flex shrink-0 gap-1">
                    {c.kind !== "file" && (
                      <Button size="sm" variant="ghost" onClick={() => refresh(c)} disabled={busy === c.id} aria-label={`Update ${c.name}`}>
                        {busy === c.id ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" className="text-rose-600" onClick={() => remove(c.id)} aria-label={`Remove ${c.name}`}>
                      <Trash2 size={14} />
                    </Button>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <Button variant={calendars.length ? "secondary" : "primary"} onClick={() => setAdding(true)}>
        <Plus size={16} /> {calendars.length ? "Add another calendar" : "Add your timetable"}
      </Button>
      {!compact && <SessionTimes />}
      <AddCalendar open={adding} onClose={() => setAdding(false)} range={range} />
    </div>
  );
}

/** When the sessions happen – needed to know which ones clash with classes. */
export function SessionTimes() {
  const times = useStore((s) => s.settings.slotTimes);
  const update = useStore((s) => s.updateSettings);
  const rows = [
    ["am1", "Morning 1"],
    ["am2", "Morning 2"],
    ["pm1", "Afternoon 1"],
    ["pm2", "Afternoon 2"],
  ] as const;
  return (
    <Field label="Session times" hint="A session is skipped when a class takes more than 30 minutes of it." group>
      <div className="space-y-2">
        {rows.map(([slot, label]) => (
          <div key={slot} className="flex items-center gap-2 text-sm">
            <span className="w-24 shrink-0 text-slate-600 dark:text-slate-400">{label}</span>
            <TextInput
              type="time"
              className="min-w-0 flex-1 sm:max-w-36"
              value={toClock(times[slot].start)}
              onChange={(e) => e.target.value && update({ slotTimes: { ...times, [slot]: { ...times[slot], start: toMinutes(e.target.value) } } })}
            />
            <span className="text-slate-400">–</span>
            <TextInput
              type="time"
              className="min-w-0 flex-1 sm:max-w-36"
              value={toClock(times[slot].end)}
              onChange={(e) => e.target.value && update({ slotTimes: { ...times, [slot]: { ...times[slot], end: toMinutes(e.target.value) } } })}
            />
          </div>
        ))}
      </div>
    </Field>
  );
}

type Way = "google" | "apple" | "link" | "file" | "timetable";

/** Calendar names that sound like classes – pre-marked as university calendars. */
const UNI_NAME = /uni|vorlesung|stundenplan|timetable|lecture|class|kurs|semester|campus|studium|course|seminar/i;

const PROVIDERS: { id: string; name: string; steps: string[] }[] = [
  {
    id: "google",
    name: "Google Calendar",
    steps: [
      "Open Google Calendar on a computer → ⚙ Settings.",
      "On the left, under “Settings for my calendars”, click the calendar.",
      "Scroll to “Integrate calendar” and copy the “Secret address in iCal format”.",
    ],
  },
  {
    id: "outlook",
    name: "Outlook / Microsoft 365",
    steps: [
      "Open Outlook on the web → ⚙ Settings → Calendar → Shared calendars.",
      "Under “Publish a calendar”, pick the calendar and “Can view all details” → Publish.",
      "Copy the ICS link.",
    ],
  },
  {
    id: "uni",
    name: "University portal",
    steps: [
      "Open your timetable in the university portal or app (e.g. Moodle, Stud.IP, HISinOne, Untis, Campus app).",
      "Look for “Export”, “Subscribe”, “iCal” or “ICS”.",
      "Copy the link – or download the .ics file and use the “File” tab.",
    ],
  },
];

function AddCalendar({ open, onClose, range }: { open: boolean; onClose: () => void; range: { from: string; to: string } }) {
  const signedIn = useAccount((s) => s.status === "signedIn");
  const save = useStore((s) => s.saveCalendar);
  const [way, setWay] = useState<Way>("google");
  const [google, setGoogle] = useState<{ token: string; calendars: (GoogleCalendar & { pick: boolean; uni: boolean })[] } | null>(null);
  const [provider, setProvider] = useState("google");
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [university, setUniversity] = useState(true);
  const [busy, setBusy] = useState(false);
  const [timetable, setTimetable] = useState<(AiTimetable & { name: string }) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const timetableInput = useRef<HTMLInputElement>(null);

  const reset = () => {
    setGoogle(null);
    setUrl("");
    setName("");
    setTimetable(null);
    setBusy(false);
  };
  const close = () => {
    reset();
    onClose();
  };
  const finish = (source: CalendarSource, events: CalEvent[]) => {
    save(source, events);
    toast(`Added “${source.name}” – ${events.length} event${events.length === 1 ? "" : "s"}. The plan now goes around them.`, { tone: "success" });
    close();
  };
  const base = (n: string, kind: CalendarSource["kind"]): CalendarSource => ({
    id: newId(),
    name: n.trim() || (university ? "University" : "Calendar"),
    kind,
    university,
    block: true,
    updatedAt: new Date().toISOString(),
  });

  const connectGoogle = async () => {
    setBusy(true);
    try {
      const token = await connectGoogleCalendar();
      const list = await listGoogleCalendars(token);
      const existing = new Set((useStore.getState().calendars ?? []).map((c) => c.googleId).filter(Boolean));
      setGoogle({
        token,
        calendars: list.filter((c) => !existing.has(c.id)).map((c) => ({ ...c, pick: UNI_NAME.test(c.summary), uni: UNI_NAME.test(c.summary) })),
      });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't connect Google Calendar.");
    } finally {
      setBusy(false);
    }
  };
  const addGoogle = async () => {
    if (!google) return;
    setBusy(true);
    try {
      let count = 0;
      const picked = google.calendars.filter((c) => c.pick);
      for (const c of picked) {
        const events = await googleEvents(google.token, c.id, range.from, range.to);
        save({ id: newId(), name: c.summary, kind: "google", googleId: c.id, university: c.uni, block: true, updatedAt: new Date().toISOString() }, events);
        count += events.length;
      }
      toast(`Added ${picked.length} Google calendar${picked.length === 1 ? "" : "s"} – ${count} events. The plan now goes around them.`, { tone: "success" });
      close();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't read the calendars.");
      setBusy(false);
    }
  };

  const addLink = async () => {
    setBusy(true);
    try {
      const events = await parseIcs(await fetchCalendarLink(url), range.from, range.to);
      finish({ ...base(name || (way === "apple" ? "Apple Calendar" : PROVIDERS.find((p) => p.id === provider)!.name), "link"), url: url.trim() }, events);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Couldn't read that calendar.");
      setBusy(false);
    }
  };
  const addFile = async (file: File) => {
    setBusy(true);
    try {
      const events = await parseIcs(await file.text(), range.from, range.to);
      finish(base(name || file.name.replace(/\.ics$/i, ""), "file"), events);
    } catch {
      toast("That file couldn't be read as a calendar (.ics).");
      setBusy(false);
    }
  };
  const readTimetable = async (file: File) => {
    setBusy(true);
    try {
      const t = await readTimetableFile(file);
      if (t.classes.length === 0) toast("No classes found in that file.");
      else setTimetable({ ...t, name: name || file.name.replace(/\.[a-z0-9]+$/i, "") });
    } catch (e) {
      toast(e instanceof Error ? e.message : "The AI couldn't read that file.");
    } finally {
      setBusy(false);
    }
  };
  const addTimetable = () => {
    if (!timetable) return;
    const from = timetable.startDate && timetable.startDate > range.from ? timetable.startDate : range.from;
    const to = timetable.endDate && timetable.endDate < range.to ? timetable.endDate : range.to;
    finish(
      {
        ...base(timetable.name, "timetable"),
        classes: timetable.classes,
        ...(timetable.startDate ? { classesFrom: timetable.startDate } : {}),
        ...(timetable.endDate ? { classesUntil: timetable.endDate } : {}),
      },
      weeklyToEvents(timetable.classes, from, to),
    );
  };

  const needsSignIn = !signedIn && way !== "file";

  return (
    <Modal
      open={open}
      onClose={close}
      title="Add a calendar"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={close}>
            Cancel
          </Button>
          {way === "google" && google && (
            <Button onClick={addGoogle} disabled={busy || !google.calendars.some((c) => c.pick)}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />} Add {google.calendars.filter((c) => c.pick).length} calendar
              {google.calendars.filter((c) => c.pick).length === 1 ? "" : "s"}
            </Button>
          )}
          {(way === "link" || way === "apple") && (
            <Button onClick={addLink} disabled={busy || !url.trim() || needsSignIn}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Add calendar
            </Button>
          )}
          {way === "timetable" && timetable && (
            <Button onClick={addTimetable}>
              <Plus size={16} /> Add {timetable.classes.length} classes
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <Segmented
          value={way}
          onChange={(w) => {
            setWay(w);
            setTimetable(null);
          }}
          options={[
            { value: "google", label: "Google" },
            { value: "apple", label: "Apple" },
            { value: "link", label: "Link" },
            { value: "file", label: ".ics" },
            { value: "timetable", label: "PDF" },
          ]}
        />
        {way !== "google" && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Name">
            <TextInput value={name} placeholder={university ? "e.g. Uni timetable" : "e.g. Work"} onChange={(e) => setName(e.target.value)} />
          </Field>
          <div className="flex items-end pb-2">
            <Toggle checked={university} onChange={setUniversity} label="This is a university calendar" />
          </div>
        </div>
        )}

        {way === "google" && !google && (
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>Sign in with Google and pick your calendars directly – StudyMaster only reads them (it never changes anything).</p>
            <Button onClick={connectGoogle} disabled={busy || !signedIn}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <CalendarDays size={16} />} Connect Google Calendar
            </Button>
          </div>
        )}
        {way === "google" && google && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600 dark:text-slate-400">Pick the calendars to plan around, and mark the university ones.</p>
            {google.calendars.length === 0 && <p className="text-sm text-slate-500">All your Google calendars are already added.</p>}
            <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
              {google.calendars.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 p-2.5 text-sm">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={c.pick}
                      onChange={(e) => setGoogle({ ...google, calendars: google.calendars.map((x) => (x.id === c.id ? { ...x, pick: e.target.checked } : x)) })}
                      className="h-4 w-4 accent-indigo-600"
                    />
                    <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: c.backgroundColor ?? "#94a3b8" }} />
                    <span className="truncate">{c.summary}</span>
                    {c.primary && <Badge>main</Badge>}
                  </label>
                  {c.pick && (
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-slate-500">
                      <input
                        type="checkbox"
                        checked={c.uni}
                        onChange={(e) => setGoogle({ ...google, calendars: google.calendars.map((x) => (x.id === c.id ? { ...x, uni: e.target.checked } : x)) })}
                        className="h-3.5 w-3.5 accent-indigo-600"
                      />
                      University
                    </label>
                  )}
                </li>
              ))}
            </ul>
            <p className="text-xs text-slate-500">Google gives access for about an hour; to update later, press ↻ next to the calendar.</p>
          </div>
        )}
        {needsSignIn && (
          <p className="rounded-2xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
            Sign in to use {way === "google" ? "Google Calendar" : way === "link" || way === "apple" ? "calendar links" : "AI for timetables"} – or use the “.ics” tab.
          </p>
        )}

        {way === "link" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id)}
                  className={cx(
                    "rounded-full border px-3 py-1.5 text-sm font-medium transition",
                    provider === p.id
                      ? "border-indigo-500 bg-indigo-50 text-indigo-700 dark:border-indigo-400 dark:bg-indigo-500/10 dark:text-indigo-300"
                      : "border-slate-200 text-slate-600 hover:border-indigo-300 dark:border-slate-700 dark:text-slate-300",
                  )}
                >
                  {p.name}
                </button>
              ))}
            </div>
            <ol className="list-decimal space-y-1 pl-5 text-sm text-slate-600 dark:text-slate-400">
              {PROVIDERS.find((p) => p.id === provider)!.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <Field label="Calendar link" hint="It stays private: only StudyMaster's server reads it to get your classes.">
              <TextInput value={url} placeholder="https://… or webcal://…" onChange={(e) => setUrl(e.target.value)} />
            </Field>
          </div>
        )}

        {way === "apple" && (
          <div className="space-y-3 text-sm text-slate-600 dark:text-slate-400">
            <p>
              Apple doesn't let other apps sign in to iCloud calendars, so you copy the calendar's link once. StudyMaster then keeps it up to date by
              itself.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="mb-1 font-semibold text-slate-800 dark:text-slate-200">On iPhone or iPad</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Open Calendar → tap “Calendars” at the bottom.</li>
                  <li>Tap ⓘ next to your calendar.</li>
                  <li>Turn on “Public Calendar” → “Share Link…” → Copy.</li>
                </ol>
              </div>
              <div className="rounded-2xl border border-slate-200 p-3 dark:border-slate-800">
                <p className="mb-1 font-semibold text-slate-800 dark:text-slate-200">On a Mac</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Open Calendar, right-click your calendar → “Share Calendar…”.</li>
                  <li>Tick “Public Calendar” and copy the link.</li>
                  <li>University calendar you subscribed to? Right-click it → “Get Info” → copy the URL.</li>
                </ol>
              </div>
            </div>
            <p className="text-xs">A public link isn't listed anywhere – only people who have it can see the calendar.</p>
            <Field label="Calendar link">
              <TextInput value={url} placeholder="webcal://p…-caldav.icloud.com/published/…" onChange={(e) => setUrl(e.target.value)} />
            </Field>
          </div>
        )}

        {way === "file" && (
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <p>Download your timetable as an .ics file (most university portals and calendar apps can export it), then choose it here.</p>
            <input ref={fileInput} type="file" accept=".ics,text/calendar" className="hidden" onChange={(e) => e.target.files?.[0] && addFile(e.target.files[0])} />
            <Button variant="secondary" onClick={() => fileInput.current?.click()} disabled={busy}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <FileUp size={16} />} Choose .ics file
            </Button>
          </div>
        )}

        {way === "timetable" && !timetable && (
          <div className="space-y-2 text-sm text-slate-600 dark:text-slate-400">
            <p>A PDF, screenshot or photo of your weekly timetable. AI reads the classes; you check them before anything is added.</p>
            <input
              ref={timetableInput}
              type="file"
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && readTimetable(e.target.files[0])}
            />
            <Button variant="secondary" onClick={() => timetableInput.current?.click()} disabled={busy || needsSignIn}>
              {busy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />} {busy ? "AI is reading your timetable…" : "Choose PDF or photo"}
            </Button>
          </div>
        )}

        {way === "timetable" && timetable && (
          <TimetableReview value={timetable} onChange={setTimetable} />
        )}
      </div>
    </Modal>
  );
}

/** Check the classes the AI found: remove wrong ones, fix times, set the semester dates. */
function TimetableReview({ value, onChange }: { value: AiTimetable & { name: string }; onChange: (v: AiTimetable & { name: string }) => void }) {
  const set = (i: number, patch: Partial<WeeklyClass>) => onChange({ ...value, classes: value.classes.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const sorted = value.classes.map((c, i) => ({ c, i })).sort((a, b) => a.c.weekday - b.c.weekday || a.c.start.localeCompare(b.c.start));
  return (
    <div className="space-y-3">
      <p className="text-sm text-slate-600 dark:text-slate-400">Found {value.classes.length} weekly classes. Fix or remove anything that's wrong.</p>
      <ul className="divide-y divide-slate-100 rounded-2xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
        {sorted.map(({ c, i }) => (
          <li key={i} className="flex flex-wrap items-center gap-2 p-2.5 text-sm">
            <span className="w-10 font-semibold">{WEEKDAY[c.weekday] ?? "?"}</span>
            <TextInput type="time" className="w-24 py-1" value={c.start} onChange={(e) => set(i, { start: e.target.value })} />
            <span className="text-slate-400">–</span>
            <TextInput type="time" className="w-24 py-1" value={c.end} onChange={(e) => set(i, { end: e.target.value })} />
            <TextInput className="min-w-32 flex-1 py-1" value={c.title} onChange={(e) => set(i, { title: e.target.value })} />
            {c.weeks !== "all" && <Badge>{c.weeks} weeks</Badge>}
            <button type="button" onClick={() => onChange({ ...value, classes: value.classes.filter((_, j) => j !== i) })} aria-label="Remove class" className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600">
              <Trash2 size={14} />
            </button>
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Classes start" hint="Leave empty: from today">
          <TextInput type="date" value={value.startDate ?? ""} onChange={(e) => onChange({ ...value, startDate: e.target.value || null })} />
        </Field>
        <Field label="Classes end" hint="Leave empty: until your last exam">
          <TextInput type="date" value={value.endDate ?? ""} onChange={(e) => onChange({ ...value, endDate: e.target.value || null })} />
        </Field>
      </div>
    </div>
  );
}
