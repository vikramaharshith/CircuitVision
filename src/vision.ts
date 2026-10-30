import { createWorker, PSM } from "tesseract.js";
import type { Box, Part, Wire } from "./model";
import { makePart, uid } from "./model";
import { pixels } from "./image";
let cvPromise: Promise<any> | undefined;
export function getCV(): Promise<any> {
  return (cvPromise ??= new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = new URL("vendor/opencv.js", document.baseURI).href;
    s.onerror = () => {
      cvPromise = undefined;
      reject(new Error("Bundled OpenCV could not load."));
    };
    s.onload = async () => {
      try {
        const cv = await (window as any).cv;
        if (cv.Mat) resolve(cv);
        else cv.onRuntimeInitialized = () => resolve(cv);
      } catch (e) {
        reject(e);
      }
    };
    document.head.appendChild(s);
  }));
}
export async function recognize(src: string, onProgress: (s: string) => void) {
  const base = new URL("vendor/", document.baseURI).href;
  const w = await createWorker("eng", 1, {
    workerPath: base + "worker.min.js",
    langPath: base,
    corePath: base,
    workerBlobURL: false,
    logger: (m) =>
      onProgress(`${m.status} ${Math.round((m.progress || 0) * 100)}%`),
  });
  try {
    await w.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
    return (await w.recognize(src, {}, { text: true, blocks: true })).data;
  } finally {
    await w.terminate();
  }
}
export async function detectParts(
  src: string,
  imageId: string,
  offset: number,
): Promise<Part[]> {
  const cv = await getCV(),
    im = await pixels(src),
    m = cv.matFromImageData(im),
    gray = new cv.Mat(),
    edges = new cv.Mat(),
    closed = new cv.Mat(),
    contours = new cv.MatVector(),
    hier = new cv.Mat(),
    kernel = cv.Mat.ones(3, 3, cv.CV_8U);
  try {
    cv.cvtColor(m, gray, cv.COLOR_RGBA2GRAY);
    cv.GaussianBlur(gray, gray, new cv.Size(3, 3), 0);
    cv.Canny(gray, edges, 45, 130);
    cv.morphologyEx(edges, closed, cv.MORPH_CLOSE, kernel);
    cv.findContours(
      closed,
      contours,
      hier,
      cv.RETR_LIST,
      cv.CHAIN_APPROX_SIMPLE,
    );
    const boxes: Box[] = [];
    const area = im.width * im.height;
    for (let i = 0; i < contours.size(); i++) {
      const c = contours.get(i);
      try {
        const r = cv.boundingRect(c),
          a = Math.abs(cv.contourArea(c)),
          ratio = Math.max(r.width / r.height, r.height / r.width);
        if (
          r.width < 12 ||
          r.height < 8 ||
          r.width * r.height > area * 0.065 ||
          r.width * r.height < area * 0.00015 ||
          a / (r.width * r.height) < 0.48 ||
          ratio > 6
        )
          continue;
        boxes.push({ x: r.x, y: r.y, w: r.width, h: r.height });
      } finally {
        c.delete();
      }
    }
    const chosen: Box[] = [];
    for (const b of boxes.sort((a, b) => b.w * b.h - a.w * a.h)) {
      if (
        chosen.some(
          (a) =>
            b.x >= a.x - 3 &&
            b.y >= a.y - 3 &&
            b.x + b.w <= a.x + a.w + 3 &&
            b.y + b.h <= a.y + a.h + 3,
        )
      )
        continue;
      chosen.push(b);
      if (chosen.length === 80) break;
    }
    return chosen.map((b, i) => makePart(b, imageId, offset + i));
  } finally {
    [m, gray, edges, closed, contours, hier, kernel].forEach((x) => x.delete());
  }
}
// Trace visible foreground connectivity after removing component bodies. All inferred links require review.
export async function traceWires(
  src: string,
  parts: Part[],
  threshold: number,
  light: boolean,
): Promise<Wire[]> {
  const cv = await getCV(),
    im = await pixels(src),
    m = cv.matFromImageData(im),
    gray = new cv.Mat(),
    mask = new cv.Mat(),
    labels = new cv.Mat();
  try {
    cv.cvtColor(m, gray, cv.COLOR_RGBA2GRAY);
    cv.threshold(
      gray,
      mask,
      threshold,
      255,
      light ? cv.THRESH_BINARY : cv.THRESH_BINARY_INV,
    );
    for (const p of parts) {
      const b = p.box;
      cv.rectangle(
        mask,
        new cv.Point(b.x, b.y),
        new cv.Point(b.x + b.w, b.y + b.h),
        new cv.Scalar(0),
        -1,
      );
    }
    cv.connectedComponents(mask, labels, 8, cv.CV_32S);
    const nets = new Map<number, { id: string; pin: number }[]>();
    for (const p of parts.filter((p) => p.pins === 2)) {
      const b = p.box,
        h = b.w >= b.h;
      const ends = h
        ? [
            [b.x - 3, b.y + b.h / 2],
            [b.x + b.w + 3, b.y + b.h / 2],
          ]
        : [
            [b.x + b.w / 2, b.y - 3],
            [b.x + b.w / 2, b.y + b.h + 3],
          ];
      ends.forEach(([x, y], index) => {
        const votes = new Map<number, number>();
        for (let dy = -4; dy <= 4; dy++)
          for (let dx = -4; dx <= 4; dx++) {
            const xx = Math.round(x + dx),
              yy = Math.round(y + dy);
            if (xx < 0 || yy < 0 || xx >= im.width || yy >= im.height) continue;
            const l = labels.intAt(yy, xx);
            if (l) votes.set(l, (votes.get(l) || 0) + 1);
          }
        const best = [...votes].sort((a, b) => b[1] - a[1])[0];
        if (best && best[1] >= 3) {
          const list = nets.get(best[0]) || [];
          list.push({ id: p.id, pin: index + 1 });
          nets.set(best[0], list);
        }
      });
    }
    const wires: Wire[] = [];
    for (const pins of nets.values()) {
      for (let i = 1; i < pins.length; i++)
        if (pins[0].id !== pins[i].id)
          wires.push({
            id: uid(),
            a: pins[0].id,
            ap: pins[0].pin,
            b: pins[i].id,
            bp: pins[i].pin,
            reviewed: false,
          });
    }
    return wires;
  } finally {
    [m, gray, mask, labels].forEach((x) => x.delete());
  }
}
