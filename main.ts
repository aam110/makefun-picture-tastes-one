// The Picture That Tastes of One Ingredient — one perfect mango.
// Painterly software renderer: Node 22 stdlib only, own PNG encoder.
// Deterministic: fixed seeds, no Date/Math.random/timestamps.
// Output: 1024x1024 PNG, one hero mango half, fanned slices, honey,
// mint, juice droplets, dark slate, golden-hour light, teal shadows.
import * as fs from "node:fs";
import * as path from "node:path";
import * as zlib from "node:zlib";

const W = 1024;
const H = 1024;

// ---------- deterministic value noise ----------
function hash2(ix: number, iy: number): number {
  let h = (ix * 374761393 + iy * 668265263) | 0;
  h = (h ^ (h >> 13)) | 0;
  h = Math.imul(h, 1274126177);
  h = (h ^ (h >> 16)) >>> 0;
  return h / 4294967295;
}
function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}
function vnoise(x: number, y: number): number {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const a = hash2(ix, iy);
  const b = hash2(ix + 1, iy);
  const c = hash2(ix, iy + 1);
  const d = hash2(ix + 1, iy + 1);
  const u = smooth(fx);
  const v = smooth(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct: number): number {
  let s = 0;
  let amp = 0.5;
  let f = 1;
  let tot = 0;
  for (let i = 0; i < oct; i++) {
    s += amp * vnoise(x * f, y * f);
    tot += amp;
    amp *= 0.5;
    f *= 2.03;
  }
  return s / tot;
}

// Seeded PRNG (mulberry32) for the fixed bokeh/droplet layout.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- colour helpers ----------
type RGB = [number, number, number];
function clamp255(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}
function over(dst: RGB, src: RGB, alpha: number): RGB {
  return [
    src[0] * alpha + dst[0] * (1 - alpha),
    src[1] * alpha + dst[1] * (1 - alpha),
    src[2] * alpha + dst[2] * (1 - alpha),
  ];
}

// ---------- precomputed painterly noise grids ----------
const GN = 160;
const gridCoarse: number[] = new Array((GN + 1) * (GN + 1));
const gridFine: number[] = new Array((GN + 1) * (GN + 1));
for (let gy = 0; gy <= GN; gy++) {
  for (let gx = 0; gx <= GN; gx++) {
    gridCoarse[gy * (GN + 1) + gx] = fbm(gx * 0.09, gy * 0.09, 3);
    gridFine[gy * (GN + 1) + gx] = fbm(gx * 0.35 + 40, gy * 0.35 + 40, 2);
  }
}
function gridAt(grid: number[], x: number, y: number): number {
  const gx = (x / W) * GN;
  const gy = (y / H) * GN;
  const ix = Math.min(GN - 1, Math.floor(gx));
  const iy = Math.min(GN - 1, Math.floor(gy));
  const fx = gx - ix;
  const fy = gy - iy;
  const a = grid[iy * (GN + 1) + ix];
  const b = grid[iy * (GN + 1) + ix + 1];
  const c = grid[(iy + 1) * (GN + 1) + ix];
  const d = grid[(iy + 1) * (GN + 1) + ix + 1];
  const u = smooth(fx);
  const v = smooth(fy);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// ---------- fixed scene layout ----------
const rng = mulberry32(20261122);
interface Bokeh { x: number; y: number; r: number; c: RGB; a: number }
const bokeh: Bokeh[] = [];
for (let i = 0; i < 62; i++) {
  const warm = rng() < 0.62;
  bokeh.push({
    x: rng() * W,
    y: rng() * 560,
    r: 14 + rng() * 66,
    c: warm ? [247, 178, 74] : [64, 158, 150],
    a: 0.05 + rng() * 0.13,
  });
}
interface Drop { x: number; y: number; r: number }
const airDrops: Drop[] = [
  { x: 300, y: 300, r: 9 },
  { x: 356, y: 238, r: 6 },
  { x: 700, y: 268, r: 8 },
  { x: 742, y: 330, r: 5 },
  { x: 250, y: 400, r: 5 },
  { x: 806, y: 210, r: 6 },
];
const fleshDrops: Drop[] = [
  { x: 430, y: 560, r: 11 },
  { x: 560, y: 500, r: 8 },
  { x: 640, y: 610, r: 10 },
  { x: 380, y: 660, r: 7 },
  { x: 600, y: 700, r: 6 },
  { x: 480, y: 640, r: 5 },
];
const foreDrops: Drop[] = [
  { x: 180, y: 880, r: 8 },
  { x: 240, y: 930, r: 6 },
  { x: 850, y: 900, r: 7 },
  { x: 910, y: 850, r: 5 },
  { x: 120, y: 960, r: 6 },
];

// ---------- shape helpers ----------
function ellipseN(x: number, y: number, cx: number, cy: number, rx: number, ry: number): number {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy;
}
// Leaf in local coords: pointed ellipse. Returns 0..1 mask (1 inside).
function leafMask(x: number, y: number, cx: number, cy: number, len: number, wid: number, ang: number): number {
  const dx = x - cx;
  const dy = y - cy;
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  const lx = (dx * ca + dy * sa) / (len / 2);
  const ly = (-dx * sa + dy * ca) / (wid / 2);
  const e = lx * lx + ly * ly;
  if (e >= 1) return 0;
  // taper the tip: narrow toward +lx end
  const taper = 1 - 0.35 * Math.max(0, lx);
  const e2 = lx * lx + (ly / taper) * (ly / taper);
  if (e2 >= 1) return 0;
  return Math.min(1, (1 - e2) * 4);
}

// Honey drizzle curves across the mango dome.
function honeyAt(x: number, y: number): number {
  const curves = [
    { y0: 560, amp: 20, per: 340, ph: 0.4, th: 8 },
    { y0: 680, amp: 18, per: 300, ph: 2.6, th: 7 },
  ];
  let m = 0;
  for (const c of curves) {
    const yc = c.y0 + c.amp * Math.sin((x / c.per) * Math.PI * 2 + c.ph)
      + 7 * Math.sin((x / 97) * Math.PI * 2 + 1.3);
    const d = Math.abs(y - yc);
    if (d < c.th) m = Math.max(m, 1 - d / c.th);
  }
  return m;
}

// ---------- main render ----------
const img = new Uint8Array(W * H * 3);
const MANGO_CX = 512;
const MANGO_CY = 652;
const MANGO_RX = 302;
const MANGO_RY = 256;
const PIVOT_X = 512;
const PIVOT_Y = 900;

for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const nC = gridAt(gridCoarse, x, y);
    const nF = gridAt(gridFine, x, y);
    // 1. Background: deep teal, warm golden-hour glow upper-left.
    let col: RGB = mix([9, 38, 44], [16, 58, 62], y / H);
    const glowDx = (x - 300) / 620;
    const glowDy = (y - 180) / 620;
    const glow = Math.max(0, 1 - Math.sqrt(glowDx * glowDx + glowDy * glowDy));
    col = over(col, [248, 176, 72], glow * glow * 0.5);
    // warm wash bottom-right
    const wrDx = (x - 880) / 700;
    const wrDy = (y - 900) / 700;
    const warm2 = Math.max(0, 1 - Math.sqrt(wrDx * wrDx + wrDy * wrDy));
    col = over(col, [214, 120, 40], warm2 * warm2 * 0.28);
    // painterly mottling: coarse clouds + fine brush dabs
    const mott = (nC - 0.5) * 0.34 + (nF - 0.5) * 0.16;
    col = [col[0] * (1 + mott), col[1] * (1 + mott), col[2] * (1 + mott)];
    // scattered warm dust motes in the light
    const mote = hash2(x >> 2, y >> 2);
    if (mote > 0.986 && glow > 0.25) col = over(col, [255, 214, 130], 0.5);
    // 2. Bokeh
    for (const b of bokeh) {
      const dx = (x - b.x) / b.r;
      const dy = (y - b.y) / b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        const a = b.a * (1 - d2) * (1 - d2);
        col = over(col, b.c, a);
      }
    }
    // 3. Slate slab
    const slateN = ellipseN(x, y, 512, 1180, 780, 600);
    if (slateN < 1) {
      const edge = Math.max(0, 1 - slateN);
      let slate: RGB = mix([26, 30, 38], [52, 58, 70], nC);
      // rim light along the top edge of the slab
      const rim = Math.max(0, 1 - Math.abs(slateN - 0.92) * 22);
      slate = over(slate, [150, 170, 190], rim * 0.5);
      // soft shadow where mango will sit
      const shDx = (x - 512) / 380;
      const shDy = (y - 700) / 130;
      const sh = Math.max(0, 1 - (shDx * shDx + shDy * shDy));
      slate = over(slate, [8, 10, 14], sh * 0.45);
      // grain + mineral speckle
      const g = (nF - 0.5) * 30;
      slate = [slate[0] + g, slate[1] + g, slate[2] + g];
      const spk = hash2(x >> 1, y >> 1);
      if (spk > 0.992) slate = over(slate, [140, 150, 165], 0.55);
      if (spk < 0.006) slate = over(slate, [10, 12, 18], 0.6);
      const sa = 0.55 + 0.45 * edge;
      col = over(col, slate, sa);
    }
    // 4. Mango dome
    const mN = ellipseN(x, y, MANGO_CX, MANGO_CY, MANGO_RX, MANGO_RY);
    if (mN < 1) {
      const edge = Math.sqrt(mN);
      // flesh gradient: bright gold centre-top -> deep orange rim
      let flesh: RGB = mix([255, 221, 105], [228, 116, 22], Math.pow(edge, 1.4) * 0.85);
      // warm light from upper-left
      const lx = (x - MANGO_CX) / MANGO_RX;
      const ly = (y - MANGO_CY) / MANGO_RY;
      const light = Math.max(0, 1 - ((lx + 0.45) * (lx + 0.45) + (ly + 0.5) * (ly + 0.5)) / 1.6);
      flesh = over(flesh, [255, 236, 160], light * 0.45);
      // painterly flesh mottling
      const fm = (nC - 0.5) * 0.22 + (nF - 0.5) * 0.1;
      flesh = [flesh[0] * (1 + fm), flesh[1] * (1 + fm), flesh[2] * (1 + fm)];
      // fanned slices: vertical curved bands, like a mango half cut in a fan
      const bandX = (x - MANGO_CX) + 46 * Math.sin((y - MANGO_CY) / 210);
      const sector = ((bandX / (MANGO_RX * 2)) + 0.5) * 7;
      const frac = sector - Math.floor(sector);
      const groove = Math.min(frac, 1 - frac);
      const grooveW = 0.05 + 0.02 * (1 - edge);
      if (groove < grooveW && edge < 0.985) {
        const ga = 0.55 * (1 - groove / grooveW);
        flesh = over(flesh, [150, 66, 8], ga);
      } else if (groove < grooveW + 0.05 && edge < 0.985) {
        // ridge highlight next to each groove
        flesh = over(flesh, [255, 228, 140], 0.35 * (1 - (groove - grooveW) / 0.05));
      }
      // skin rim: deep red-orange edge
      if (edge > 0.965) {
        flesh = over(flesh, [176, 62, 18], (edge - 0.965) / 0.035);
      }
      // soft contact shadow at dome bottom
      if (ly > 0.55) flesh = over(flesh, [120, 52, 6], (ly - 0.55) * 0.5);
      // broad gloss sheen upper-left of dome
      const glDx = (x - 400) / 190;
      const glDy = (y - 540) / 120;
      const gl = Math.max(0, 1 - (glDx * glDx + glDy * glDy));
      flesh = over(flesh, [255, 244, 190], gl * gl * 0.5);
      col = flesh;
      // honey drizzle over the flesh
      const hn = honeyAt(x, y);
      if (hn > 0) {
        col = over(col, [216, 138, 8], hn * 0.85);
        col = over(col, [255, 205, 90], hn * 0.35);
      }
      // juice droplets on the flesh
      for (const d of fleshDrops) {
        const dx = (x - d.x) / d.r;
        const dy = (y - d.y) / d.r;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1) {
          col = over(col, [255, 240, 170], (1 - d2) * 0.75);
          const spDx = (x - (d.x - d.r * 0.3)) / (d.r * 0.35);
          const spDy = (y - (d.y - d.r * 0.3)) / (d.r * 0.35);
          if (spDx * spDx + spDy * spDy < 1) col = over(col, [255, 255, 255], 0.9);
        }
      }
    }
    // 5. Mint sprig (top-right of the mango)
    const leaves = [
      { cx: 800, cy: 452, len: 150, wid: 62, ang: -0.7 },
      { cx: 838, cy: 500, len: 130, wid: 56, ang: -0.15 },
      { cx: 762, cy: 500, len: 120, wid: 52, ang: -1.25 },
    ];
    for (const L of leaves) {
      const lm = leafMask(x, y, L.cx, L.cy, L.len, L.wid, L.ang);
      if (lm > 0) {
        const dx = x - L.cx;
        const dy = y - L.cy;
        const ca = Math.cos(L.ang);
        const sa = Math.sin(L.ang);
        const lx = (dx * ca + dy * sa) / (L.len / 2);
        let leaf: RGB = mix([24, 96, 44], [86, 178, 84], 0.5 + 0.5 * lx);
        leaf = over(leaf, [190, 230, 120], Math.max(0, 1 - Math.abs(lyOf(dx, dy, ca, sa, L.wid))) * 0.18);
        const lmott = (nF - 0.5) * 0.16;
        leaf = [leaf[0] * (1 + lmott), leaf[1] * (1 + lmott), leaf[2] * (1 + lmott)];
        col = over(col, leaf, lm * 0.96);
        // vein
        const vein = Math.abs(lyOf(dx, dy, ca, sa, L.wid));
        if (vein < 0.08 && Math.abs(lx) < 0.95) col = over(col, [150, 205, 110], 0.5);
      }
    }
    function lyOf(dx: number, dy: number, ca: number, sa: number, wid: number): number {
      return (-dx * sa + dy * ca) / (wid / 2);
    }
    // 6. Juice droplets mid-air (glossy, catching the light)
    for (const d of airDrops) {
      const dx = (x - d.x) / d.r;
      const dy = (y - d.y) / d.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        col = over(col, [255, 196, 90], (1 - d2) * 0.8);
        const spDx = (x - (d.x - d.r * 0.3)) / (d.r * 0.32);
        const spDy = (y - (d.y - d.r * 0.32)) / (d.r * 0.32);
        if (spDx * spDx + spDy * spDy < 1) col = over(col, [255, 255, 255], 0.95);
      }
    }
    // 7. Foreground garnish: big mint leaf bottom-left, honey puddle bottom-right
    const fl = leafMask(x, y, 150, 905, 210, 84, 0.5);
    if (fl > 0) {
      const dx = x - 150;
      const dy = y - 905;
      const ca = Math.cos(0.5);
      const sa = Math.sin(0.5);
      const lx = (dx * ca + dy * sa) / 105;
      let leaf: RGB = mix([20, 88, 40], [80, 170, 78], 0.5 + 0.5 * lx);
      col = over(col, leaf, fl * 0.96);
      if (Math.abs(lyOf(dx, dy, ca, sa, 84)) < 0.07 && Math.abs(lx) < 0.95) {
        col = over(col, [150, 205, 110], 0.45);
      }
    }
    const pudN = ellipseN(x, y, 852, 918, 150, 42);
    if (pudN < 1) {
      let pud: RGB = mix([190, 116, 6], [255, 196, 80], 1 - Math.sqrt(pudN));
      const pglDx = (x - 820) / 90;
      const pglDy = (y - 908) / 22;
      const pgl = Math.max(0, 1 - (pglDx * pglDx + pglDy * pglDy));
      pud = over(pud, [255, 230, 150], pgl * 0.7);
      col = over(col, pud, 0.95);
    }
    for (const d of foreDrops) {
      const dx = (x - d.x) / d.r;
      const dy = (y - d.y) / d.r;
      const d2 = dx * dx + dy * dy;
      if (d2 < 1) {
        col = over(col, [255, 196, 90], (1 - d2) * 0.8);
        const spDx = (x - (d.x - d.r * 0.3)) / (d.r * 0.32);
        const spDy = (y - (d.y - d.r * 0.32)) / (d.r * 0.32);
        if (spDx * spDx + spDy * spDy < 1) col = over(col, [255, 255, 255], 0.95);
      }
    }
    // 8. Vignette + film grain
    const vx = (x - 512) / 512;
    const vy = (y - 512) / 512;
    const vig = 1 - 0.22 * Math.max(0, vx * vx + vy * vy - 0.55);
    const grain = (hash2(x, y) - 0.5) * 5;
    const o = (y * W + x) * 3;
    img[o] = clamp255(col[0] * vig + grain);
    img[o + 1] = clamp255(col[1] * vig + grain);
    img[o + 2] = clamp255(col[2] * vig + grain);
  }
}

// ---------- PNG encoder (zlib deflate, filter 0) ----------
const crcTable = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[n] = c;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(Buffer.concat([Buffer.from(type, "ascii"), data])), 8 + data.length);
  return out;
}
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}
function filterRow(row: Buffer, prev: Buffer | null, type: number): Buffer {
  const out = Buffer.alloc(row.length);
  for (let i = 0; i < row.length; i++) {
    const a = i >= 3 ? row[i - 3] : 0;
    const b = prev ? prev[i] : 0;
    const c = prev && i >= 3 ? prev[i - 3] : 0;
    let v = row[i];
    if (type === 1) v = row[i] - a;
    else if (type === 2) v = row[i] - b;
    else if (type === 3) v = row[i] - ((a + b) >> 1);
    else if (type === 4) v = row[i] - paeth(a, b, c);
    out[i] = v & 0xff;
  }
  return out;
}
function filterScore(f: Buffer): number {
  let s = 0;
  for (let i = 0; i < f.length; i++) {
    const v = f[i] < 128 ? f[i] : f[i] - 256;
    s += v < 0 ? -v : v;
  }
  return s;
}
const raw = Buffer.alloc(H * (1 + W * 3));
let prevRow: Buffer | null = null;
for (let y = 0; y < H; y++) {
  const row = Buffer.from(img.buffer, y * W * 3, W * 3);
  let bestType = 0;
  let bestRow = filterRow(row, prevRow, 0);
  let bestScore = filterScore(bestRow);
  for (let t = 1; t <= 4; t++) {
    const cand = filterRow(row, prevRow, t);
    const sc = filterScore(cand);
    if (sc < bestScore) {
      bestScore = sc;
      bestType = t;
      bestRow = cand;
    }
  }
  raw[y * (1 + W * 3)] = bestType;
  bestRow.copy(raw, y * (1 + W * 3) + 1);
  prevRow = row;
}
const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(W, 0);
ihdr.writeUInt32BE(H, 4);
ihdr[8] = 8; // bit depth
ihdr[9] = 2; // colour type RGB
ihdr[10] = 0;
ihdr[11] = 0;
ihdr[12] = 0;
const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk("IHDR", ihdr),
  chunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
  chunk("IEND", Buffer.alloc(0)),
]);

const outDir = process.env.MAKEFUN_OUTPUT_DIR || path.join(process.cwd(), "output");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "entry.png"), png);
console.log(`wrote ${png.length} bytes -> ${path.join(outDir, "entry.png")}`);
