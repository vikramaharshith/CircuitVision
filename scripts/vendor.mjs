import { mkdir, copyFile, readdir } from "node:fs/promises";
const dest = "public/vendor";
await mkdir(dest, { recursive: true });
await copyFile(
  "node_modules/@techstark/opencv-js/dist/opencv.js",
  `${dest}/opencv.js`,
);
await copyFile(
  "node_modules/tesseract.js/dist/worker.min.js",
  `${dest}/worker.min.js`,
);
for (const file of await readdir("node_modules/tesseract.js-core"))
  if (/\.wasm(\.js)?$/.test(file))
    await copyFile(`node_modules/tesseract.js-core/${file}`, `${dest}/${file}`);
await copyFile(
  "node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz",
  `${dest}/eng.traineddata.gz`,
);
console.log("Offline OpenCV, OCR worker, WASM and English model bundled.");
