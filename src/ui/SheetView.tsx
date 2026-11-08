import { useMemo, useState } from "react";
import { labelRects } from "../core/geometry";
import { layoutProject } from "../render/layout";
import type { RenderDeps } from "../render/pdf";
import { SheetPreview } from "../render/preview";
import { currentGrid, useAppState, type Store } from "./store";

export function SheetView({ store, deps }: { store: Store; deps: RenderDeps }) {
  const state = useAppState(store);
  const [startMode, setStartMode] = useState(false);
  const layout = useMemo(() => layoutProject(state.project, deps, { guides: true }), [state.project, deps]);
  const zone = currentGrid(state);
  const template = zone ? deps.templates(zone.templateId) : undefined;
  const cells = template ? labelRects(template) : [];
  const used = zone ? zone.cells.used : [];

  function clickCell(index: number) {
    if (startMode) {
      store.setCells(cells.map((_, i) => i).filter((i) => i >= index));
      setStartMode(false);
    } else {
      store.setCells(used.includes(index) ? used.filter((i) => i !== index) : [...used, index].sort((a, b) => a - b));
    }
  }

  return (
    <section className="sheet-view">
      <div className="sheet-controls">
        <strong>Yaprak</strong>
        <span>
          {used.length}/{cells.length} etiket
        </span>
        <button onClick={() => store.setCells(cells.map((_, i) => i))}>Hepsi</button>
        <button onClick={() => store.setCells([])}>Hiçbiri</button>
        <button className={startMode ? "selected" : ""} onClick={() => setStartMode(!startMode)}>
          {startMode ? "Başlanacak etikete tıklayın" : "Buradan başlat"}
        </button>
      </div>
      <SheetPreview page={layout.pages[state.pageIndex]} cells={cells} usedCells={used} onCellClick={clickCell} />
      {[...layout.errors, ...layout.warnings].map((message) => (
        <p key={message} className="notice">
          {message}
        </p>
      ))}
    </section>
  );
}
