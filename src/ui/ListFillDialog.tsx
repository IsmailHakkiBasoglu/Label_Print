import { useMemo, useState } from "react";
import { fillWouldReplace, parseLines, previewListFill, type ListFillOptions } from "../core/listFill";
import { searchSymbols } from "../library/symbols/search";
import { isMultiColor } from "../library/symbols/svg";
import type { RenderDeps } from "../render/pdf";
import { currentGrid, useAppState, type Store } from "./store";

type Props = { store: Store; deps: RenderDeps; capacity: number; label: { width: number; height: number }; onClose: () => void };

function describe(r: ReturnType<typeof previewListFill>): string {
  return [
    `${r.filled} etiket dolacak`,
    r.pagesAdded > 0 ? `${r.pagesAdded} yeni sayfa açılacak` : "",
    r.unusedCells > 0 ? `${r.unusedCells} etiket boş kalacak` : "",
    r.noSymbol > 0 ? `${r.noSymbol} satır için görsel bulunamadı` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function ListFillDialog({ store, deps, capacity, label, onClose }: Props) {
  const state = useAppState(store);
  const [text, setText] = useState("");
  const [wantSuggest, setWantSuggest] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const grid = currentGrid(state);
  const hasSymbol = !!grid && state.project.designs[grid.designId]?.elements.some((e) => e.kind === "symbol");
  const lines = useMemo(() => parseLines(text), [text]);
  const isColored = (id: string) => {
    if (id.startsWith("color:") || id.startsWith("upload:")) return true;
    const symbol = deps.symbols(id);
    return !!symbol && isMultiColor(symbol.icon);
  };

  const options: Omit<ListFillOptions, "newId"> = {
    cellCount: capacity,
    label,
    ...(wantSuggest && hasSymbol
      ? { suggest: (line: string, sample: string) => searchSymbols(line, 1, isColored(sample) ? deps.colorSymbols : undefined)[0]?.id ?? null }
      : {}),
  };
  const report = useMemo(
    () => (lines.length ? previewListFill(state.project, state.pageIndex, lines, { ...options, newId: () => "onizleme" }) : null),
    // `options` is rebuilt each render from exactly these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lines, wantSuggest, hasSymbol, state.project, state.pageIndex, capacity, deps],
  );

  function fill() {
    if (fillWouldReplace(state.project) && !confirming) {
      setConfirming(true);
      return;
    }
    store.fillFromList(lines, options);
    onClose();
  }

  return (
    <div className="dialog list-fill" role="dialog" aria-label="Listeden doldur">
      <h2>Listeden doldur</h2>
      <label>
        Liste (her satır bir etiket)
        <textarea
          rows={10}
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            setConfirming(false);
          }}
        />
      </label>
      <label className="inline">
        <input type="checkbox" checked={wantSuggest && hasSymbol} disabled={!hasSymbol} onChange={(e) => setWantSuggest(e.target.checked)} /> Sembol öner
      </label>
      {!hasSymbol && <p className="hint">Önce ortak tasarıma bir görsel ekleyin; hücreler onun yerini kullanır.</p>}
      {report && (
        <p className="hint" role="status">
          {describe(report)}
        </p>
      )}
      {confirming && <p className="notice">Önceki liste içeriği ve listeyle açılan sayfalar değişecek.</p>}
      <button className="primary" disabled={lines.length === 0} onClick={fill}>
        {confirming ? "Evet, değiştir" : "Doldur"}
      </button>
      <button onClick={onClose}>Vazgeç</button>
    </div>
  );
}
