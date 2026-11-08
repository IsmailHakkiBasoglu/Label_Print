import { XMLParser } from "fast-xml-parser";

/** `fillColor` and `strokeColor` are set only for fixed colours; without them the path takes the element's colour. */
export type VectorPath = { d: string; fill: boolean; strokeWidth: number; fillColor?: string; strokeColor?: string };
export type VectorIcon = { viewBox: [number, number, number, number]; paths: VectorPath[] };

type Attrs = Record<string, string>;
type Style = { fill: boolean; strokeWidth: number; fillColor?: string; strokeColor?: string };

const NAMED_COLORS: Record<string, string> = {
  black: "#000000", white: "#ffffff", red: "#ff0000", lime: "#00ff00", green: "#008000", blue: "#0000ff", yellow: "#ffff00",
  orange: "#ffa500", purple: "#800080", pink: "#ffc0cb", gray: "#808080", grey: "#808080", brown: "#a52a2a",
};

type ParsedColor = { color?: string } | { error: string };

function parseColor(raw: string): ParsedColor {
  const value = raw.trim().toLowerCase();
  if (value === "currentcolor") return {};
  if (value.startsWith("url(")) return { error: "Gradyan içeren SVG desteklenmiyor." };
  if (/^#[0-9a-f]{6}$/.test(value)) return { color: value };
  if (/^#[0-9a-f]{3}$/.test(value)) return { color: `#${[...value.slice(1)].map((c) => c + c).join("")}` };
  const rgb = /^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/.exec(value);
  if (rgb) return { color: `#${rgb.slice(1, 4).map((n) => Math.min(Number(n), 255).toString(16).padStart(2, "0")).join("")}` };
  if (NAMED_COLORS[value]) return { color: NAMED_COLORS[value] };
  return { error: `Renk okunamadı: ${raw}` };
}

function colorError(a: Attrs): string | null {
  for (const key of ["fill", "stroke"]) {
    if (a[key] === undefined || a[key] === "none") continue;
    const parsed = parseColor(a[key]);
    if ("error" in parsed) return parsed.error;
  }
  return null;
}

function inheritColor(value: string | undefined, parent: string | undefined): string | undefined {
  if (value === undefined) return parent;
  if (value === "none") return undefined;
  const parsed = parseColor(value);
  return "color" in parsed ? parsed.color : undefined;
}

export function isMultiColor(icon: VectorIcon): boolean {
  return icon.paths.some((p) => p.fillColor !== undefined || p.strokeColor !== undefined);
}

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
    fillColor: inheritColor(a.fill, parent.fillColor),
    strokeColor: inheritColor(a.stroke, parent.strokeColor),
  };
}

function walk(nodes: any[], style: Style & { stroked: boolean }, out: VectorPath[]): string | null {
  for (const node of nodes) {
    const tag = Object.keys(node).find((k) => k !== ":@");
    if (!tag || tag === "#text") continue;
    const a: Attrs = node[":@"] ?? {};
    if ((tag === "g" || SHAPES.has(tag)) && a.transform) return "Dönüşüm (transform) içeren SVG desteklenmiyor.";
    const badColor = tag === "g" || SHAPES.has(tag) ? colorError(a) : null;
    if (badColor) return badColor;
    const own = nextStyle(a, style);
    if (tag === "g") {
      const error = walk(node.g, own, out);
      if (error) return error;
    } else if (SHAPES.has(tag)) {
      const d = shapeToPath(tag, a);
      if (d && (own.fill || own.stroked)) {
        out.push({
          d,
          fill: own.fill,
          strokeWidth: own.stroked ? own.strokeWidth : 0,
          ...(own.fill && own.fillColor ? { fillColor: own.fillColor } : {}),
          ...(own.stroked && own.strokeColor ? { strokeColor: own.strokeColor } : {}),
        });
      }
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
  const rootColorError = colorError(a);
  if (rootColorError) return { error: rootColorError };
  const error = walk(root.svg, nextStyle(a, { fill: true, stroked: false, strokeWidth: 1 }), paths);
  if (error) return { error };
  if (paths.length === 0) return { error: "SVG içinde çizim yok." };
  return { viewBox: box as VectorIcon["viewBox"], paths };
}
