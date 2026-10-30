import { test } from "node:test";
import assert from "node:assert/strict";
import { decodeBands, detectBands, classify } from "../src/resistors.ts";
import { fresh, makePart, validateProject, pinPosition } from "../src/model.ts";
test("decodes four/five bands and fractional multipliers", () => {
  assert.equal(decodeBands(["brown", "black", "red", "gold"]), "1 kΩ ±5%");
  assert.equal(
    decodeBands(["brown", "black", "black", "brown", "brown"]),
    "1 kΩ ±1%",
  );
  assert.equal(decodeBands(["red", "red", "gold", "silver"]), "2.2 Ω ±10%");
  assert.equal(decodeBands(["gold", "black", "red", "gold"]), "");
  assert.equal(decodeBands(["red", "red", "red", "white"]), "");
});
test("classifies actual RGB samples conservatively", () => {
  assert.equal(classify(230, 30, 25), "red");
  assert.equal(classify(25, 25, 25), "black");
  assert.equal(classify(20, 130, 35), "green");
});
test("extracts bands from raster pixels", () => {
  const w = 200,
    h = 40,
    data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const stripe =
        x >= 25 && x < 35
          ? [110, 55, 25]
          : x >= 65 && x < 75
            ? [10, 10, 10]
            : x >= 105 && x < 115
              ? [220, 20, 20]
              : x >= 150 && x < 160
                ? [170, 170, 170]
                : [205, 180, 130];
      data.set([...stripe, 255], (y * w + x) * 4);
    }
  const bands = detectBands(data, w, h);
  assert.deepEqual(bands, ["brown", "black", "red", "gray"]);
});
test("import rejects invalid connection references", () => {
  const p = fresh();
  p.wires.push({
    id: "a",
    a: "missing",
    ap: 1,
    b: "missing2",
    bp: 2,
    reviewed: false,
  });
  assert.throws(() => validateProject(p), /Invalid connection/);
});
test("project round-trip preserves pin topology and photo mapping", () => {
  const p = fresh();
  p.photos.push({
    id: "image",
    name: "Board",
    data: "data:image/png;base64,AAAA",
    width: 100,
    height: 100,
  });
  const c = makePart({ x: 10, y: 10, w: 40, h: 10 }, "image", 0);
  p.parts.push(c);
  assert.deepEqual(validateProject(JSON.parse(JSON.stringify(p))), p);
  assert.equal(pinPosition(c, 1).x, c.x - 55);
  assert.equal(pinPosition(c, 2).x, c.x + 55);
});
