export type Kind =
  | "unknown"
  | "resistor"
  | "capacitor"
  | "diode"
  | "transistor"
  | "ic"
  | "connector";
export type Box = { x: number; y: number; w: number; h: number };
export type Part = {
  id: string;
  label: string;
  kind: Kind;
  value: string;
  marking: string;
  box: Box;
  imageId: string;
  x: number;
  y: number;
  pins: number;
  reviewed: boolean;
  source: "manual" | "vision" | "ocr";
  closeup?: string;
};
export type Wire = {
  id: string;
  a: string;
  ap: number;
  b: string;
  bp: number;
  reviewed: boolean;
};
export type Photo = {
  id: string;
  name: string;
  data: string;
  width: number;
  height: number;
};
export type Project = {
  schema: 1;
  id: string;
  name: string;
  updated: string;
  photos: Photo[];
  parts: Part[];
  wires: Wire[];
};
export const uid = () => crypto.randomUUID();
export const fresh = (): Project => ({
  schema: 1,
  id: uid(),
  name: "Untitled circuit",
  updated: new Date().toISOString(),
  photos: [],
  parts: [],
  wires: [],
});
export function makePart(box: Box, imageId: string, index: number): Part {
  return {
    id: uid(),
    label: `X${index + 1}`,
    kind: "unknown",
    value: "",
    marking: "",
    box,
    imageId,
    x: 120 + (index % 4) * 200,
    y: 100 + Math.floor(index / 4) * 160,
    pins: 2,
    reviewed: false,
    source: "vision",
  };
}
export function pinPosition(p: Part, n: number) {
  const left = n <= Math.ceil(p.pins / 2);
  const count = Math.ceil(p.pins / 2);
  return {
    x: p.x + (left ? -55 : 55),
    y: p.y + ((left ? n - 1 : n - count - 1) - (count - 1) / 2) * 22,
  };
}
export function validateProject(v: unknown): Project {
  const p = v as Project;
  if (
    !p ||
    p.schema !== 1 ||
    typeof p.id !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(p.id) ||
    typeof p.name !== "string" ||
    typeof p.updated !== "string" ||
    !Array.isArray(p.photos) ||
    !Array.isArray(p.parts) ||
    !Array.isArray(p.wires)
  )
    throw new Error("Not a CircuitVision project.");
  if (p.photos.length > 200 || p.parts.length > 1000 || p.wires.length > 4000)
    throw new Error("Project exceeds supported size.");
  const ids = new Set<string>();
  for (const i of p.photos) {
    if (
      typeof i.id !== "string" ||
      ids.has(i.id) ||
      !/^data:image\/(png|jpeg|webp);base64,/.test(i.data) ||
      !Number.isFinite(i.width) ||
      !Number.isFinite(i.height) ||
      i.width <= 0 ||
      i.height <= 0
    )
      throw new Error("Invalid project image.");
    ids.add(i.id);
  }
  const parts = new Map<string, Part>();
  for (const c of p.parts) {
    if (
      !c ||
      typeof c.id !== "string" ||
      parts.has(c.id) ||
      !ids.has(c.imageId) ||
      ![
        "unknown",
        "resistor",
        "capacitor",
        "diode",
        "transistor",
        "ic",
        "connector",
      ].includes(c.kind) ||
      ![c.x, c.y, c.box?.x, c.box?.y, c.box?.w, c.box?.h].every(
        Number.isFinite,
      ) ||
      !Number.isInteger(c.pins) ||
      c.pins < 2 ||
      c.pins > 40 ||
      ![c.label, c.value, c.marking].every((x) => typeof x === "string") ||
      (c.closeup && !/^data:image\/(png|jpeg|webp);base64,/.test(c.closeup))
    )
      throw new Error("Invalid component.");
    const photo = p.photos.find((i) => i.id === c.imageId)!;
    if (
      c.box.x < 0 ||
      c.box.y < 0 ||
      c.box.w <= 0 ||
      c.box.h <= 0 ||
      c.box.x + c.box.w > photo.width ||
      c.box.y + c.box.h > photo.height
    )
      throw new Error("Component region exceeds image.");
    parts.set(c.id, c);
  }
  for (const w of p.wires) {
    if (
      !parts.has(w.a) ||
      !parts.has(w.b) ||
      ![w.ap, w.bp].every(Number.isInteger) ||
      w.ap < 1 ||
      w.bp < 1 ||
      w.ap > parts.get(w.a)!.pins ||
      w.bp > parts.get(w.b)!.pins
    )
      throw new Error("Invalid connection.");
  }
  return p;
}
