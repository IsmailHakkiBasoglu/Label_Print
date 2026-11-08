import { useMemo, useState } from "react";
import { labelRects } from "../core/geometry";
import { layoutProject } from "../render/layout";
import type { RenderDeps } from "../render/pdf";
import { SheetPreview } from "../render/preview";
import { ListFillDialog } from "./ListFillDialog";
import { currentGrid, useAppState, type Store } from "./store";

export function SheetView({ store, deps }: { store: Store; deps: RenderDeps }) {
  const state = useAppState(store);
  const [selecting, setSelecting] = useState(false);
  const [startMode, setStartMode] = useState(false);
  const [filling, setFilling] = useState(false);
  const layout = useMemo(() => layoutProject(state.project, deps, { guides: true }), [state.project, deps]);
  const zone = currentGrid(state);
  const template = zone ? deps.templates(zone.templateId) : undefined;
  const cells = template ? labelRects(template) : [];
  const used = zone ? zone.cells.used : [];
  const pages = state.project.pages.length;
  const marks = Object.fromEntries(Object.entries(zone?.content ?? {}).map(([cell, entry]) => [cell, entry.designId ? ("detached" as const) : ("value" as const)]));

  function clickCell(index: number) {
    if (startMode) {
      store.setCells(cells.map((_, i) => i).filter((i) => i >= index));
      setStartMode(false);
    } else if (selecting) {
      store.setCells(used.includes(index) ? used.filter((i) => i !== index) : [...used, index].sort((a, b) => a - b));
    } else {
      store.setScope({ kind: "cell", cell: index });
    }
  }

  return (
    <section className="sheet-view">
      <div className="sheet-controls">
        <strong>Yaprak</strong>
        <span>
          {used.length}/{cells.length} etiket
        </span>
        <button className={state.scope.kind === "all" ? "selected" : ""} onClick={() => store.setScope({ kind: "all" })}>
          Tüm hücreler
        </button>
        <button disabled={!template} onClick={() => setFilling(true)}>
          Listeden doldur
        </button>
        <button className={selecting ? "selected" : ""} onClick={() => setSelecting(!selecting)}>
          Hücre seç
        </button>
        {selecting && (
          <>
            <button onClick={() => store.setCells(cells.map((_, i) => i))}>Hepsi</button>
            <button onClick={() => store.setCells([])}>Hiçbiri</button>
            <button className={startMode ? "selected" : ""} onClick={() => setStartMode(!startMode)}>
              {startMode ? "Başlanacak etikete tıklayın" : "Buradan başlat"}
            </button>
          </>
        )}
      </div>
      <div className="sheet-controls">
        <button aria-label="Önceki sayfa" disabled={state.pageIndex === 0} onClick={() => store.setPage(state.pageIndex - 1)}>
          ‹
        </button>
        <span>
          Sayfa {state.pageIndex + 1} / {pages}
        </span>
        <button aria-label="Sonraki sayfa" disabled={state.pageIndex >= pages - 1} onClick={() => store.setPage(state.pageIndex + 1)}>
          ›
        </button>
        <button aria-label="Sayfa ekle" onClick={() => store.addPage(cells.length)}>
          + Sayfa
        </button>
        <button aria-label="Sayfayı sil" disabled={pages <= 1} onClick={() => store.removePage(state.pageIndex)}>
          Sil
        </button>
      </div>
      <SheetPreview
        page={layout.pages[state.pageIndex]}
        cells={cells}
        usedCells={used}
        onCellClick={clickCell}
        selectedCell={state.scope.kind === "cell" && !selecting ? state.scope.cell : undefined}
        cellMarks={marks}
      />
      {[...layout.errors, ...layout.warnings].map((message) => (
        <p key={message} className="notice">
          {message}
        </p>
      ))}
      {filling && template && <ListFillDialog store={store} deps={deps} capacity={cells.length} label={template.label} onClose={() => setFilling(false)} />}
    </section>
  );
}
