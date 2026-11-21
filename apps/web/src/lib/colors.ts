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

/** A light version of a color that works on light and dark backgrounds. */
export function tint(color: string, percent: number): string {
  return `color-mix(in srgb, ${color} ${percent}%, transparent)`;
}

/**
 * Background image (CSS) for a day with these subject colors: one color → a light tint,
 * two → split diagonally, more → diagonal stripes, one band per subject.
 */
export function dayBackground(colors: string[], percent: number): string | undefined {
  if (colors.length === 0) return undefined;
  if (colors.length === 1) return `linear-gradient(${tint(colors[0]!, percent)}, ${tint(colors[0]!, percent)})`;
  const step = 100 / colors.length;
  const stops = colors.map((c, i) => `${tint(c, percent)} ${(i * step).toFixed(2)}% ${((i + 1) * step).toFixed(2)}%`);
  return `linear-gradient(135deg, ${stops.join(", ")})`;
}

