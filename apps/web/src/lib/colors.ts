/** Subject colors that read well on light and dark backgrounds. */
export const SUBJECT_COLORS = [
  "#6366f1", // indigo
  "#10b981", // emerald
  "#f59e0b", // amber
  "#f43f5e", // rose
  "#0ea5e9", // sky
  "#8b5cf6", // violet
  "#14b8a6", // teal
  "#f97316", // orange
];

export function nextColor(used: (string | undefined)[]): string {
  const free = SUBJECT_COLORS.find((c) => !used.includes(c));
  return free ?? SUBJECT_COLORS[used.length % SUBJECT_COLORS.length]!;
}

/** "#10b981" → [16, 185, 129]; anything else → undefined. */
function rgb(color: string): [number, number, number] | undefined {
  const hex = color.trim().replace(/^#/, "");
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return undefined;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

/** A light (see-through) version of a color – plain rgba, works in every browser. */
export function tint(color: string, percent: number): string {
  const c = rgb(color);
  return c ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${(percent / 100).toFixed(2)})` : color;
}

/** A subject's color, or a stable fallback if it has none. */
export function subjectColor(subject: { id: string; color?: string } | undefined): string {
  if (!subject) return SUBJECT_COLORS[0]!;
  if (subject.color && rgb(subject.color)) return subject.color;
  let h = 0;
  for (const ch of subject.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return SUBJECT_COLORS[h % SUBJECT_COLORS.length]!;
}

/**
 * Background image (CSS) for a day with these subject colors: one color → a
 * light tint, two → split diagonally, more → diagonal stripes.
 */
export function dayBackground(colors: string[], percent: number): string | undefined {
  if (colors.length === 0) return undefined;
  if (colors.length === 1) return `linear-gradient(${tint(colors[0]!, percent)}, ${tint(colors[0]!, percent)})`;
  const step = 100 / colors.length;
  const stops = colors.map((c, i) => `${tint(c, percent)} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`);
  return `linear-gradient(to bottom right, ${stops.join(", ")})`;
}
