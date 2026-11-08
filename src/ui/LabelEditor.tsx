import { useRef, type PointerEvent as ReactPointerEvent } from "react";
import type { DesignElement } from "../core/document";
import type { FrameLabel } from "../library/frames";
import { layoutDesign } from "../render/layout";
import type { RenderDeps } from "../render/pdf";
import { OpsView } from "../render/preview";
import { activeDesign, currentGrid, currentPage, useAppState, type Store } from "./store";

const SNAP_MM = 0.5;
const MIN_SIZE_MM = 2;
const snap = (n: number) => Math.round(n / SNAP_MM) * SNAP_MM;

export function activeLabel(store: Store, deps: RenderDeps): FrameLabel {
  const state = store.getState();
  const free = state.active ? currentPage(state).zones[state.active.zone] : undefined;
  if (free?.kind === "free") return { width: free.width, height: free.height, shape: "rect" };
  const grid = currentGrid(state);
  const template = grid ? deps.templates(grid.templateId) : undefined;
  return template?.label ?? { width: 50, height: 30, shape: "rect" };
}

export function LabelEditor({ store, deps }: { store: Store; deps: RenderDeps }) {
  const state = useAppState(store);
  const svg = useRef<SVGSVGElement>(null);
  const design = activeDesign(state);
  const label = activeLabel(store, deps);
  const handle = Math.max(1.2, Math.min(label.width, label.height) * 0.05);

  function toMm(event: PointerEvent | ReactPointerEvent) {
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.current!.getScreenCTM()!.inverse());
    return { x: point.x, y: point.y };
  }

  function startDrag(event: ReactPointerEvent, element: DesignElement, resize: boolean) {
    event.preventDefault();
    event.stopPropagation();
    store.select(element.id);
    const start = toMm(event);
    const move = (e: PointerEvent) => {
      const now = toMm(e);
      const [dx, dy] = [now.x - start.x, now.y - start.y];
      if (resize) store.updateElement(element.id, { width: Math.max(MIN_SIZE_MM, snap(element.width + dx)), height: Math.max(MIN_SIZE_MM, snap(element.height + dy)) });
      else store.updateElement(element.id, { x: snap(element.x + dx), y: snap(element.y + dy) });
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop);
  }

  const curved = label.shape === "circle" || label.shape === "oval";
  return (
    <section className="editor">
      <div className="sheet-controls">
        <strong>Etiket</strong>
        <span>
          {label.width} × {label.height} mm
        </span>
        {state.active && <button onClick={() => store.setActive(null)}>Etikete dön</button>}
      </div>
      <div className="canvas" onPointerDown={() => store.select(null)}>
        <svg ref={svg} viewBox={`-1 -1 ${label.width + 2} ${label.height + 2}`} role="img" aria-label="Etiket editörü">
          {curved ? (
            <ellipse cx={label.width / 2} cy={label.height / 2} rx={label.width / 2} ry={label.height / 2} className="label-bg" />
          ) : (
            <rect width={label.width} height={label.height} rx={label.shape === "rounded" ? label.cornerRadius ?? 2 : 0} className="label-bg" />
          )}
          <OpsView ops={layoutDesign(design, label, deps)} />
          {design.elements.map((el) => {
            const selected = el.id === state.selectedElementId;
            return (
              <g key={el.id}>
                <rect className={selected ? "el selected" : "el"} x={el.x} y={el.y} width={el.width} height={el.height} onPointerDown={(e) => startDrag(e, el, false)} />
                {selected && <rect className="handle" x={el.x + el.width - handle / 2} y={el.y + el.height - handle / 2} width={handle} height={handle} onPointerDown={(e) => startDrag(e, el, true)} />}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}
