import { XMLParser } from "fast-xml-parser";

export type VectorPath = { d: string; fill: boolean; strokeWidth: number };
export type VectorIcon = { viewBox: [number, number, number, number]; paths: VectorPath[] };

type Attrs = Record<string, string>;
type Style = { fill: boolean; strokeWidth: number };

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  processEntities: false,
  preserveOrder: true,
});

const num = (a: Attrs, k: string) => Number(a[k] ?? 0);

function points(a: Attrs): string[] {
  const n = (a.points ?? "").trim().split(/[\s,]+/);
  const out: string[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) out.push(`${n[i]} ${n[i + 1]}`);
  return out;
}

const NUMBER = /^[\s,]*([-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?)/;
const FLAG = /^[\s,]*([01])/;

/** Rewrites path data with every argument separated, because pdf-lib cannot read compact forms such as arc flags written as "011". */
export function normalizePathData(d: string): string {
  let rest = d.trim();
  let out = "";
  while (rest) {
    const command = /^[\s,]*([a-zA-Z])/.exec(rest);
    if (!command) return d;
    rest = rest.slice(command[0].length);
    const isArc = command[1].toLowerCase() === "a";
    const args: string[] = [];
    for (;;) {
      const match = (isArc && [3, 4].includes(args.length % 7) ? FLAG : NUMBER).exec(rest);
      if (!match) break;
      args.push(match[1]);
      rest = rest.slice(match[0].length);
    }
    out += command[1] + args.join(" ");
  }
  return out;
}

function shapeToPath(tag: string, a: Attrs): string | null {
  switch (tag) {
    case "path":
      return a.d ? normalizePathData(a.d) : null;
    case "circle":
    case "ellipse": {
      const [cx, cy] = [num(a, "cx"), num(a, "cy")];
      const rx = tag === "circle" ? num(a, "r") : num(a, "rx");
      const ry = tag === "circle" ? num(a, "r") : num(a, "ry");
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case "rect": {
      const [x, y, w, h] = [num(a, "x"), num(a, "y"), num(a, "width"), num(a, "height")];
      const r = Math.min(num(a, "rx") || num(a, "ry"), w / 2, h / 2);
      if (!r) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + r} ${y}H${x + w - r}A${r} ${r} 0 0 1 ${x + w} ${y + r}V${y + h - r}A${r} ${r} 0 0 1 ${x + w - r} ${y + h}H${x + r}A${r} ${r} 0 0 1 ${x} ${y + h - r}V${y + r}A${r} ${r} 0 0 1 ${x + r} ${y}Z`;
    }
    case "line":
      return `M${num(a, "x1")} ${num(a, "y1")}L${num(a, "x2")} ${num(a, "y2")}`;
    case "polyline":
    case "polygon": {
      const p = points(a);
      if (p.length < 2) return null;
      return `M${p.join("L")}${tag === "polygon" ? "Z" : ""}`;
    }
    default:
      return null;
  }
}

const SHAPES = new Set(["path", "circle", "ellipse", "rect", "line", "polyline", "polygon"]);

function nextStyle(a: Attrs, parent: Style & { stroked: boolean }): Style & { stroked: boolean } {
  return {
    fill: a.fill !== undefined ? a.fill !== "none" : parent.fill,
    stroked: a.stroke !== undefined ? a.stroke !== "none" : parent.stroked,
    strokeWidth: a["stroke-width"] !== undefined ? Number(a["stroke-width"]) : parent.strokeWidth,
  };
}

function walk(nodes: any[], style: Style & { stroked: boolean }, out: VectorPath[]): string | null {
  for (const node of nodes) {
    const tag = Object.keys(node).find((k) => k !== ":@");
    if (!tag || tag === "#text") continue;
    const a: Attrs = node[":@"] ?? {};
    if ((tag === "g" || SHAPES.has(tag)) && a.transform) return "Dönüşüm (transform) içeren SVG desteklenmiyor.";
    const own = nextStyle(a, style);
    if (tag === "g") {
      const error = walk(node.g, own, out);
      if (error) return error;
    } else if (SHAPES.has(tag)) {
      const d = shapeToPath(tag, a);
      if (d && (own.fill || own.stroked)) out.push({ d, fill: own.fill, strokeWidth: own.stroked ? own.strokeWidth : 0 });
    }
  }
  return null;
}

/** Only whitelisted drawing tags survive, so scripts, links and handlers never reach the output. */
export function parseSvg(text: string): VectorIcon | { error: string } {
  let tree: any[];
  try {
    tree = parser.parse(text);
  } catch {
    return { error: "SVG okunamadı." };
  }
  const root = Array.isArray(tree) ? tree.find((n) => n.svg) : undefined;
  if (!root) return { error: "Bu dosya SVG değil." };
  const a: Attrs = root[":@"] ?? {};
  const box = (a.viewBox ?? `0 0 ${parseFloat(a.width ?? "0")} ${parseFloat(a.height ?? "0")}`).trim().split(/[\s,]+/).map(Number);
  if (box.length !== 4 || box.some(Number.isNaN) || !(box[2] > 0 && box[3] > 0)) return { error: "SVG boyutu (viewBox) eksik." };
  const paths: VectorPath[] = [];
  const error = walk(root.svg, nextStyle(a, { fill: true, stroked: false, strokeWidth: 1 }), paths);
  if (error) return { error };
  if (paths.length === 0) return { error: "SVG içinde çizim yok." };
  return { viewBox: box as VectorIcon["viewBox"], paths };
}
