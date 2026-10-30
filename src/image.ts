import type { Box, Photo } from "./model";
import { uid } from "./model";
export async function loadImage(src: string) {
  const i = new Image();
  i.src = src;
  await i.decode();
  return i;
}
export async function normalize(
  src: string,
  name = "Circuit photo",
): Promise<Photo> {
  const i = await loadImage(src);
  const scale = Math.min(1, 1600 / Math.max(i.width, i.height));
  const c = document.createElement("canvas");
  c.width = Math.round(i.width * scale);
  c.height = Math.round(i.height * scale);
  c.getContext("2d")!.drawImage(i, 0, 0, c.width, c.height);
  return {
    id: uid(),
    name,
    data: c.toDataURL("image/jpeg", 0.9),
    width: c.width,
    height: c.height,
  };
}
export async function crop(src: string, b: Box) {
  const i = await loadImage(src);
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(b.w));
  c.height = Math.max(1, Math.round(b.h));
  c.getContext("2d")!.drawImage(i, b.x, b.y, b.w, b.h, 0, 0, c.width, c.height);
  return c.toDataURL("image/png");
}
export async function pixels(src: string) {
  const i = await loadImage(src);
  const c = document.createElement("canvas");
  c.width = i.width;
  c.height = i.height;
  const ctx = c.getContext("2d")!;
  ctx.drawImage(i, 0, 0);
  return ctx.getImageData(0, 0, i.width, i.height);
}
