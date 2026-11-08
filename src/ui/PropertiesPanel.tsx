import type { CellEntry, DesignElement, FontId } from "../core/document";
import { searchSymbols, type SymbolEntry } from "../library/symbols/search";
import { isMultiColor } from "../library/symbols/svg";
import type { RenderDeps } from "../render/pdf";
import { IconView } from "./IconView";
import { activeDesign, currentGrid, useAppState, type Store } from "./store";

const FONTS: [FontId, string][] = [
  ["sans", "Sade"],
  ["sans-bold", "Sade kalın"],
  ["serif", "Tırnaklı"],
  ["serif-bold", "Tırnaklı kalın"],
];

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label>
      {label}
      <input
        type="number"
        step="0.5"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

function CellFields({ store, deps, cell, entry }: { store: Store; deps: RenderDeps; cell: number; entry?: CellEntry }) {
  const state = useAppState(store);
  const symbolName = (id: string) => deps.symbols(id)?.tags[0] ?? state.project.images[id.replace("upload:", "")]?.name ?? id;
  return (
    <>
      {activeDesign(state).elements.map((element) => {
        const value = entry?.values[element.id];
        return (
          <div key={element.id} className="cell-field">
            {element.kind === "text" ? (
              <>
                <label>
                  Metin
                  <textarea rows={2} value={value ?? element.text} onChange={(e) => store.setCellValue(cell, element.id, e.target.value)} />
                </label>
                <Suggestions text={value ?? element.text} colored={deps.colorSymbols} onPick={(id) => store.pickSymbol(id)} />
              </>
            ) : (
              <>
                <small>Görsel: {value === "" ? "bu etikette gizli" : (symbolName(value ?? element.symbolId))}</small>
                <p className="hint">Değiştirmek için soldaki Sembol sekmesinden seçin.</p>
                {value !== "" && <button onClick={() => store.setCellValue(cell, element.id, "")}>Bu etikette gizle</button>}
              </>
            )}
            {value !== undefined && <button onClick={() => store.clearCellValue(cell, element.id)}>Ortak içeriğe dön</button>}
          </div>
        );
      })}
    </>
  );
}

export function PropertiesPanel({ store, deps }: { store: Store; deps: RenderDeps }) {
  const state = useAppState(store);
  const element = activeDesign(state).elements.find((e) => e.id === state.selectedElementId);
  const update = (patch: Partial<DesignElement>) => element && store.updateElement(element.id, patch);
  const cell = state.scope.kind === "cell" && !state.active ? state.scope.cell : null;
  const entry = cell !== null ? currentGrid(state)?.content[cell] : undefined;
  const locked = cell !== null && !entry?.designId;
  const cellText = element?.kind === "text" && cell !== null ? entry?.values[element.id] : undefined;
  const hasOwnColors = (id: string) => {
    const entrySymbol = deps.symbols(id);
    return entrySymbol ? isMultiColor(entrySymbol.icon) : id.startsWith("upload:");
  };

  return (
    <aside className="panel">
      {cell !== null && (
        <div className="cell-head">
          <strong>{cell + 1}. etiket</strong>
          {locked ? <button onClick={() => store.detachCell(cell)}>Bu hücreyi ayır</button> : <button onClick={() => store.reattachCell(cell)}>Ortağa döndür</button>}
        </div>
      )}
      <button disabled={locked} onClick={() => store.addText()}>
        + Yazı ekle
      </button>
      {locked && (
        <>
          <CellFields store={store} deps={deps} cell={cell} entry={entry} />
          <p className="hint">Konum, boyut ve çerçeve ortak tasarımdan gelir. Bu etikette farklı olsun istiyorsanız hücreyi ayırın.</p>
        </>
      )}
      {!locked && !element && <p className="hint">Düzenlemek için etikette bir eleman seçin.</p>}
      {!locked && element && (
        <div className="properties">
          {element.kind === "text" && (
            <>
              <label>
                Metin
                <textarea
                  rows={3}
                  value={cellText ?? element.text}
                  onChange={(e) => (cell !== null ? store.setCellValue(cell, element.id, e.target.value) : update({ text: e.target.value }))}
                />
              </label>
              <Suggestions text={cellText ?? element.text} colored={deps.colorSymbols} onPick={(id) => store.pickSymbol(id)} />
              <label>
                Yazı tipi
                <select value={element.fontId} onChange={(e) => update({ fontId: e.target.value as FontId })}>
                  {FONTS.map(([id, name]) => (
                    <option key={id} value={id}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
              <NumberField label="Yazı boyutu (pt)" value={element.sizePt} onChange={(sizePt) => update({ sizePt })} />
              <label>
                Hizalama
                <select value={element.align} onChange={(e) => update({ align: e.target.value as "left" })}>
                  <option value="left">Sola</option>
                  <option value="center">Ortaya</option>
                  <option value="right">Sağa</option>
                </select>
              </label>
            </>
          )}
          {!(element.kind === "symbol" && hasOwnColors(element.symbolId)) && (
            <label>
              Renk
              <input type="color" value={element.color} onChange={(e) => update({ color: e.target.value })} />
            </label>
          )}
          <div className="fields">
            <NumberField label="X (mm)" value={element.x} onChange={(x) => update({ x })} />
            <NumberField label="Y (mm)" value={element.y} onChange={(y) => update({ y })} />
            <NumberField label="Genişlik" value={element.width} onChange={(width) => width > 0 && update({ width })} />
            <NumberField label="Yükseklik" value={element.height} onChange={(height) => height > 0 && update({ height })} />
          </div>
          <button className="danger" onClick={() => store.removeElement(element.id)}>
            Elemanı sil
          </button>
        </div>
      )}
    </aside>
  );
}

function Suggestions({ text, colored = [], onPick }: { text: string; colored?: SymbolEntry[]; onPick: (id: string) => void }) {
  const hits = [...searchSymbols(text, 6), ...searchSymbols(text, 6, colored)];
  if (hits.length === 0) return null;
  return (
    <div className="suggestions">
      <small>Önerilen semboller</small>
      <div className="icons">
        {hits.map((s) => (
          <button key={s.id} aria-label={`Sembol ekle: ${s.id}`} title={s.tags[0]} onClick={() => onPick(s.id)}>
            <IconView icon={s.icon} />
          </button>
        ))}
      </div>
    </div>
  );
}
