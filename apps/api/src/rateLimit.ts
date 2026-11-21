/** AI reads per user and hour (per Worker instance – the Anthropic spend limit is the hard cap). */
const PER_HOUR = 20;
const recent = new Map<string, number[]>();

export function allow(uid: string, now = Date.now()): boolean {
  const hour = now - 3600_000;
  const list = (recent.get(uid) ?? []).filter((t) => t > hour);
  if (list.length >= PER_HOUR) return false;
  list.push(now);
  recent.set(uid, list);
  return true;
}
