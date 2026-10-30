import { readdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
async function walk(dir) {
  let files = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory()) files.push(...(await walk(p)));
    else files.push(p);
  }
  return files;
}
const files = (await walk("dist")).filter((p) => !p.endsWith("/sw.js"));
const hash = createHash("sha256");
for (const p of files) hash.update(await readFile(p));
const cache = `circuitvision-${hash.digest("hex").slice(0, 16)}`;
await writeFile(
  "dist/sw.js",
  `const CACHE=${JSON.stringify(cache)}, FILES=${JSON.stringify(files.map((p) => "./" + p.slice(5)))};
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k.startsWith('circuitvision-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method==='GET'&&new URL(e.request.url).origin===self.location.origin)e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)));});`,
);
