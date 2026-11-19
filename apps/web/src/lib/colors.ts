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
