import type { OrnamentFrame, OrnamentPart } from "./layout";

const KAPPA = 0.5523;
const n = (v: number) => String(Math.round(v * 1000) / 1000);
const p = (x: number, y: number) => `${n(x)} ${n(y)}`;

function ellipse(cx: number, cy: number, rx: number, ry: number, hole = false): string {
  const [kx, ky] = [rx * KAPPA, ry * KAPPA * (hole ? -1 : 1)];
  const ty = ry * (hole ? -1 : 1);
  return (
    `M${p(cx - rx, cy)}` +
    `C${p(cx - rx, cy - ky)} ${p(cx - kx, cy - ty)} ${p(cx, cy - ty)}` +
    `C${p(cx + kx, cy - ty)} ${p(cx + rx, cy - ky)} ${p(cx + rx, cy)}` +
    `C${p(cx + rx, cy + ky)} ${p(cx + kx, cy + ty)} ${p(cx, cy + ty)}` +
    `C${p(cx - kx, cy + ty)} ${p(cx - rx, cy + ky)} ${p(cx - rx, cy)}Z`
  );
}

const circle = (cx: number, cy: number, r: number, hole = false) => ellipse(cx, cy, r, r, hole);
const ring = (cx: number, cy: number, outer: number, inner: number) => circle(cx, cy, outer) + circle(cx, cy, inner, true);
const poly = (...points: [number, number][]) => `M${points.map(([x, y]) => p(x, y)).join("L")}Z`;
const box = (x: number, y: number, w: number, h: number) => poly([x, y], [x + w, y], [x + w, y + h], [x, y + h]);
const diamond = (cx: number, cy: number, rx: number, ry: number) => poly([cx, cy - ry], [cx + rx, cy], [cx, cy + ry], [cx - rx, cy]);

function leaf(x0: number, y0: number, x1: number, y1: number, width: number): string {
  const [mx, my] = [(x0 + x1) / 2, (y0 + y1) / 2];
  const [dx, dy] = [x1 - x0, y1 - y0];
  const length = Math.hypot(dx, dy);
  const [ox, oy] = [(-dy / length) * width, (dx / length) * width];
  return `M${p(x0, y0)}C${p(mx + ox, my + oy)} ${p(mx + ox, my + oy)} ${p(x1, y1)}C${p(mx - ox, my - oy)} ${p(mx - ox, my - oy)} ${p(x0, y0)}Z`;
}

function star(cx: number, cy: number, outer: number, inner: number, points = 5): string {
  const corners: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const angle = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? inner : outer;
    corners.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)]);
  }
  return poly(...corners);
}

function heart(cx: number, cy: number, s: number): string {
  return `M${p(cx, cy + s)}C${p(cx - 1.5 * s, cy + 0.1 * s)} ${p(cx - s, cy - s)} ${p(cx, cy - 0.35 * s)}C${p(cx + s, cy - s)} ${p(cx + 1.5 * s, cy + 0.1 * s)} ${p(cx, cy + s)}Z`;
}

/** An L-shaped rule meeting the rails of the edges at the corner. */
function rail(at: number, thickness: number): string {
  const end = 12;
  const inner = at + thickness;
  return poly([at, at], [end, at], [end, inner], [inner, inner], [inner, end], [at, end]);
}

const edge = (width: number, ...d: string[]): OrnamentPart => ({ size: [width, 10], d });
const corner = (...d: string[]): OrnamentPart => ({ size: [12, 12], d });
const BAND_RATIO = 0.14;

const cornerDot = (r = 3) => corner(rail(1, 0.9), circle(7, 7, r));
const cornerRing = () => corner(rail(1, 0.9), ring(7, 7, 3.6, 2));
const cornerDiamond = () => corner(rail(1, 0.9), diamond(7, 7, 3.6, 3.6));
const cornerStar = () => corner(rail(1, 0.9), star(7, 7, 4.4, 1.9));
const cornerSquare = () => corner(box(0.5, 0.5, 8, 8), box(9.2, 0.5, 2.8, 1.4), box(0.5, 9.2, 1.4, 2.8));
const cornerLeaves = () => corner(leaf(1, 1, 11, 4, 2.2), leaf(1, 1, 4, 11, 2.2), circle(8, 8, 1.6));
const cornerHeart = () => corner(rail(1, 0.9), heart(7.2, 7.2, 3));
const cornerFan = () => corner(poly([1, 1], [11.5, 3], [8, 7]), poly([1, 1], [7, 8], [3, 11.5]), circle(10, 10, 1.5));
const cornerCurl = () => corner(leaf(1, 1, 11, 2.5, 1.6), leaf(1, 1, 2.5, 11, 1.6), ring(7.5, 7.5, 3.2, 1.8));

const frame = (id: string, name: string, category: string, c: OrnamentPart, e: OrnamentPart): OrnamentFrame => ({ id: `o-${id}`, name, category, corner: c, edge: e, bandRatio: BAND_RATIO });

export const ORNAMENT_CATEGORIES = ["klasik", "bitkisel", "kurdele", "geometrik", "mutfak", "vintage"] as const;

export const ORNAMENTS: OrnamentFrame[] = [
  frame("pearl", "İnci dizisi", "klasik", cornerDot(), edge(7, circle(3.5, 4.5, 2.6))),
  frame("beads", "Boncuk ve baklava", "klasik", cornerDiamond(), edge(12, circle(3, 4.5, 1.6), diamond(9, 4.5, 2.2, 3.6))),
  frame(
    "key",
    "Yunan anahtarı",
    "klasik",
    cornerSquare(),
    edge(12, box(0, 0.5, 12, 1.2), box(0, 8.3, 12, 1.2), box(2, 1.7, 1.2, 5), box(2, 5.5, 6.5, 1.2), box(7.3, 3.7, 1.2, 2), box(5, 3.7, 3.5, 1.2), box(10.6, 1.7, 1.2, 6.6)),
  ),
  frame("scallop", "Fisto", "klasik", cornerRing(), edge(10, "M0 1L10 1C10 10 0 10 0 1Z")),

  frame("vine", "Yaprak dalı", "bitkisel", cornerLeaves(), edge(12, box(0, 4.7, 12, 0.6), leaf(1, 5, 6, 0.8, 1.5), leaf(7, 5, 12, 9.2, 1.5))),
  frame("laurel", "Defne", "bitkisel", cornerLeaves(), edge(9, box(0, 4.7, 9, 0.6), leaf(0.5, 5, 8, 1.2, 1.3), leaf(0.5, 5, 8, 8.8, 1.3))),
  frame(
    "flower",
    "Papatya",
    "bitkisel",
    cornerDot(2.6),
    edge(12, ...[0, 1, 2, 3, 4, 5].map((i) => circle(6 + 2.9 * Math.cos((i * Math.PI) / 3), 5 + 2.9 * Math.sin((i * Math.PI) / 3), 1.5)), circle(6, 5, 1.1)),
  ),
  frame("tulip", "Lale", "bitkisel", cornerLeaves(), edge(12, "M6 0.8C9.5 2 9.5 6 6 7.5C2.5 6 2.5 2 6 0.8Z", box(5.6, 7, 0.8, 3), leaf(6, 9.5, 11.5, 6.5, 1), leaf(6, 9.5, 0.5, 6.5, 1))),

  frame("twist", "Kurdele", "kurdele", cornerDiamond(), edge(9, poly([0, 1], [4.5, 1], [9, 9], [4.5, 9]))),
  frame("rope", "Halat", "kurdele", cornerRing(), edge(6, leaf(0, 8.8, 6, 1.2, 2))),
  frame("stitch", "Dikiş", "kurdele", cornerSquare(), edge(8, box(0, 0.6, 8, 0.8), box(0, 8.6, 8, 0.8), box(1.2, 4.1, 5.6, 1.8))),
  frame("braid", "Örgü", "kurdele", cornerRing(), edge(12, leaf(0, 1.8, 12, 8.2, 1.4), leaf(0, 8.2, 12, 1.8, 1.4))),

  frame("triangles", "Üçgenler", "geometrik", cornerSquare(), edge(10, poly([0, 0.5], [10, 0.5], [5, 8.5]))),
  frame("zigzag", "Zikzak", "geometrik", cornerDiamond(), edge(10, poly([0, 1.5], [5, 6], [10, 1.5], [10, 4.5], [5, 9], [0, 4.5]))),
  frame("diamonds", "Baklava dilimi", "geometrik", cornerDiamond(), edge(10, diamond(5, 5, 4.6, 4.5) + `M${p(5, 2.5)}L${p(2.5, 5)}L${p(5, 7.5)}L${p(7.5, 5)}Z`)),
  frame("checker", "Dama", "geometrik", cornerSquare(), edge(10, box(0, 0, 5, 5), box(5, 5, 5, 5))),

  frame("gingham", "Mutfak örtüsü", "mutfak", cornerSquare(), edge(8, box(0, 0, 4, 4), box(4, 4, 4, 4), box(0, 8.6, 8, 1))),
  frame("wheat", "Başak", "mutfak", cornerLeaves(), edge(10, box(0, 4.7, 10, 0.6), leaf(1, 5, 5, 1, 1.1), leaf(1, 5, 5, 9, 1.1), leaf(5.5, 5, 9.5, 1, 1.1), leaf(5.5, 5, 9.5, 9, 1.1))),
  frame("hearts", "Kalpler", "mutfak", cornerHeart(), edge(10, heart(5, 4.8, 3.2))),
  frame(
    "cutlery",
    "Kaşık ve çatal",
    "mutfak",
    cornerDot(2.6),
    edge(14, ellipse(4, 2.8, 2, 2.6), box(3.45, 4.8, 1.1, 5), box(8.4, 0.3, 0.8, 3.6), box(9.8, 0.3, 0.8, 3.6), box(11.2, 0.3, 0.8, 3.6), box(8.4, 3.3, 3.6, 1.3), box(9.65, 4.2, 1.1, 5.6)),
  ),

  frame("fan", "Yelpaze", "vintage", cornerFan(), edge(10, poly([5, 9], [0.8, 3], [3.2, 1.2]), poly([5, 9], [3.9, 0.9], [6.1, 0.9]), poly([5, 9], [6.8, 1.2], [9.2, 3]))),
  frame("flourish", "Kıvrım", "vintage", cornerCurl(), edge(14, box(0, 4.7, 14, 0.5), leaf(1, 5, 7, 1.2, 1.3), ring(9, 3.2, 2, 0.9), leaf(13, 5, 7, 8.8, 1.3), ring(5, 6.8, 2, 0.9))),
  frame("lace", "Dantel", "vintage", cornerRing(), edge(10, "M0 1L10 1C10 10 0 10 0 1Z" + circle(5, 3.6, 1.5, true))),
  frame("stars", "Yıldızlar", "vintage", cornerStar(), edge(10, star(5, 5, 4.4, 1.9))),
];
