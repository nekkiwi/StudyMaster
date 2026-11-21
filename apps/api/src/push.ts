/** The reminder scheduler (Durable Object). Helpers: reminder.ts. */
import { DurableObject } from "cloudflare:workers";
import { generateVapidKeys, nextReminder, reminderDue, validEndpoint, vapidHeader, zoned, type ReminderState, type ReminderUpdate, type VapidKeys } from "./reminder";

export type { ReminderUpdate } from "./reminder";

interface Env {
  REMINDERS: DurableObjectNamespace<Reminders>;
}

const SUBJECT = "https://app.studymaster.workers.dev";

export class Reminders extends DurableObject<Env> {
  /** "vapid" instance: the server's push keys, created on first use. */
  async vapidKeys(): Promise<VapidKeys> {
    let keys = await this.ctx.storage.get<VapidKeys>("vapid");
    if (!keys) {
      keys = await generateVapidKeys();
      await this.ctx.storage.put("vapid", keys);
    }
    return keys;
  }

  /** User instance: stores what changed and schedules the next reminder. */
  async update(change: ReminderUpdate): Promise<{ next: number | null; devices: number }> {
    const state: ReminderState = (await this.ctx.storage.get<ReminderState>("state")) ?? {
      subscriptions: [],
      time: "20:00",
      timeZone: "UTC",
      planDates: [],
    };
    if (change.subscription && validEndpoint(change.subscription.endpoint)) {
      state.subscriptions = [...state.subscriptions.filter((s) => s.endpoint !== change.subscription!.endpoint), change.subscription].slice(-10);
    }
    if (change.removeEndpoint) state.subscriptions = state.subscriptions.filter((s) => s.endpoint !== change.removeEndpoint);
    if (change.time && /^\d{2}:\d{2}$/.test(change.time)) state.time = change.time;
    if (change.timeZone) {
      try {
        zoned(Date.now(), change.timeZone);
        state.timeZone = change.timeZone;
      } catch {
        // unknown zone: keep the old one
      }
    }
    if (change.planDates) state.planDates = change.planDates.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).slice(0, 60);
    if (change.lastCheckIn) state.lastCheckIn = change.lastCheckIn;
    await this.ctx.storage.put("state", state);

    if (state.subscriptions.length === 0) {
      await this.ctx.storage.deleteAlarm();
      return { next: null, devices: 0 };
    }
    const next = nextReminder(Date.now(), state.time, state.timeZone);
    await this.ctx.storage.setAlarm(next);
    return { next, devices: state.subscriptions.length };
  }

  async alarm(): Promise<void> {
    const state = await this.ctx.storage.get<ReminderState>("state");
    if (!state || state.subscriptions.length === 0) return;
    if (reminderDue(state, Date.now())) {
      const keys = await this.env.REMINDERS.get(this.env.REMINDERS.idFromName("vapid")).vapidKeys();
      const gone: string[] = [];
      for (const sub of state.subscriptions) {
        try {
          const res = await fetch(sub.endpoint, {
            method: "POST",
            headers: { TTL: "43200", Urgency: "normal", Authorization: await vapidHeader(sub.endpoint, keys, SUBJECT) },
          });
          // 404/410: the browser dropped this subscription.
          if (res.status === 404 || res.status === 410) gone.push(sub.endpoint);
        } catch {
          // try again tomorrow
        }
      }
      if (gone.length) {
        state.subscriptions = state.subscriptions.filter((s) => !gone.includes(s.endpoint));
        await this.ctx.storage.put("state", state);
      }
    }
    if (state.subscriptions.length) await this.ctx.storage.setAlarm(nextReminder(Date.now(), state.time, state.timeZone));
  }
}
