import type { FontId } from "../core/document";
import type { Rect } from "../core/geometry";
import type { LayoutPage } from "./layout";
import type { RenderOp } from "./ops";

const MM_PER_PT = 25.4 / 72;

export function fontStyle(id: FontId) {
  return { fontFamily: id.startsWith("serif") ? "LP Serif" : "LP Sans", fontWeight: id.endsWith("bold") ? 700 : 400, fontKerning: "none" as const };
}

export function OpsView({ ops }: { ops: RenderOp[] }) {
  return (
    <>
      {ops.map((op, i) => {
        if (op.kind === "guide") {
          const { x, y, width, height } = op.rect;
          return op.shape === "circle" || op.shape === "oval" ? (
            <ellipse key={i} className="guide" cx={x + width / 2} cy={y + height / 2} rx={width / 2} ry={height / 2} />
          ) : (
            <rect key={i} className="guide" x={x} y={y} width={width} height={height} />
          );
        }
        if (op.kind === "text") {
          return (
            <text key={i} x={op.x} y={op.y} fontSize={op.sizePt * MM_PER_PT} fill={op.color} style={fontStyle(op.font)}>
              {op.text}
            </text>
          );
        }
        return (
          <path
            key={i}
            transform={`translate(${op.x} ${op.y}) scale(${op.scale})`}
            d={op.d}
            fill={op.fill ?? "none"}
            stroke={op.stroke?.color ?? "none"}
            strokeWidth={op.stroke ? op.stroke.widthMm / op.scale : 0}
            strokeDasharray={op.stroke?.dash?.map((d) => d / op.scale).join(" ")}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        );
      })}
    </>
  );
}

type Props = { page: LayoutPage; cells?: Rect[]; usedCells?: number[]; onCellClick?: (index: number) => void };

export function SheetPreview({ page, cells = [], usedCells = [], onCellClick }: Props) {
  return (
    <svg className="sheet" viewBox={`0 0 ${page.sheet.width} ${page.sheet.height}`} role="img" aria-label="Yaprak önizlemesi">
      <rect x={0} y={0} width={page.sheet.width} height={page.sheet.height} fill="#ffffff" />
      <OpsView ops={page.ops} />
      {cells.map((c, i) => (
        <rect key={i} className={usedCells.includes(i) ? "cell used" : "cell"} x={c.x} y={c.y} width={c.width} height={c.height} onClick={() => onCellClick?.(i)} />
      ))}
    </svg>
  );
}
