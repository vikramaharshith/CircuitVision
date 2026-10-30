export const colors = [
  "black",
  "brown",
  "red",
  "orange",
  "yellow",
  "green",
  "blue",
  "violet",
  "gray",
  "white",
  "gold",
  "silver",
] as const;
export type Color = (typeof colors)[number];
export const hex = [
  "#17191b",
  "#71452b",
  "#cf3835",
  "#f08b34",
  "#ebd24a",
  "#428258",
  "#377bb2",
  "#8858a8",
  "#8d959b",
  "#e8e9e4",
  "#b99a43",
  "#b6bcc2",
];
export function decodeBands(b: Color[]): string {
  if (b.length !== 4 && b.length !== 5) return "";
  const digits = b.slice(0, b.length - 2).map((c) => colors.indexOf(c));
  if (digits.some((n) => n > 9)) return "";
  const m = b[b.length - 2],
    exponent = m === "gold" ? -1 : m === "silver" ? -2 : colors.indexOf(m);
  const tolerance: Partial<Record<Color, number>> = {
    brown: 1,
    red: 2,
    green: 0.5,
    blue: 0.25,
    violet: 0.1,
    gray: 0.05,
    gold: 5,
    silver: 10,
  };
  const t = tolerance[b.at(-1)!];
  if (t === undefined) return "";
  const value = Number(digits.join("")) * 10 ** exponent;
  return `${Number((value >= 1e6 ? value / 1e6 : value >= 1e3 ? value / 1e3 : value).toPrecision(4))} ${value >= 1e6 ? "M" : value >= 1e3 ? "k" : ""}Ω ±${t}%`;
}
// Conservative HSV classifier; metallic bands cannot be distinguished reliably from a single RGB photograph.
export function classify(r: number, g: number, b: number): Color | null {
  const max = Math.max(r, g, b) / 255,
    min = Math.min(r, g, b) / 255,
    d = max - min,
    s = max === 0 ? 0 : d / max;
  if (max < 0.19) return "black";
  if (s < 0.16) return max > 0.82 ? "white" : max > 0.32 ? "gray" : null;
  let h =
    d === 0
      ? 0
      : max === r / 255
        ? ((g - b) / 255 / d) % 6
        : max === g / 255
          ? (b - r) / 255 / d + 2
          : (r - g) / 255 / d + 4;
  h = (h * 60 + 360) % 360;
  if (h < 18 || h > 345) return max < 0.55 ? "brown" : "red";
  if (h < 43) return max < 0.65 ? "brown" : "orange";
  if (h < 72) return "yellow";
  if (h < 170) return "green";
  if (h < 265) return "blue";
  if (h < 325) return "violet";
  return null;
}
export function detectBands(
  data: Uint8ClampedArray,
  width: number,
  height: number,
  vertical = false,
): Color[] {
  const length = vertical ? height : width,
    across = vertical ? width : height;
  const runs: { c: Color | null; n: number }[] = [];
  for (let x = Math.floor(length * 0.07); x < length * 0.93; x++) {
    const votes = new Map<Color, number>();
    for (let y = Math.floor(across * 0.28); y < across * 0.72; y++) {
      const p = (vertical ? x * width + y : y * width + x) * 4;
      const c = classify(data[p], data[p + 1], data[p + 2]);
      if (c) votes.set(c, (votes.get(c) || 0) + 1);
    }
    const c = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const last = runs.at(-1);
    if (last?.c === c) last.n++;
    else runs.push({ c, n: 1 });
  }
  const totals = new Map<Color, number>();
  for (const r of runs) if (r.c) totals.set(r.c, (totals.get(r.c) || 0) + r.n);
  const body = [...totals].sort((a, b) => b[1] - a[1])[0];
  return runs
    .filter(
      (r) =>
        r.c &&
        !(body && body[1] > length * 0.35 && r.c === body[0]) &&
        r.n >= Math.max(2, length * 0.018) &&
        r.n < length * 0.16,
    )
    .map((r) => r.c!)
    .slice(0, 8);
}
