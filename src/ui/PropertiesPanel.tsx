import type { DesignElement, FontId } from "../core/document";
import { searchSymbols } from "../library/symbols/search";
import type { RenderDeps } from "../render/pdf";
import { IconView } from "./IconView";
import { activeDesign, useAppState, type Store } from "./store";

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

export function PropertiesPanel({ store, deps: _deps }: { store: Store; deps: RenderDeps }) {
  const state = useAppState(store);
  const element = activeDesign(state).elements.find((e) => e.id === state.selectedElementId);
  const update = (patch: Partial<DesignElement>) => element && store.updateElement(element.id, patch);

  return (
    <aside className="panel">
      <button onClick={() => store.addText()}>+ Yazı ekle</button>
      {!element && <p className="hint">Düzenlemek için etikette bir eleman seçin.</p>}
      {element && (
        <div className="properties">
          {element.kind === "text" && (
            <>
              <label>
                Metin
                <textarea rows={3} value={element.text} onChange={(e) => update({ text: e.target.value })} />
              </label>
              <Suggestions text={element.text} onPick={(id) => store.addSymbol(id)} />
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
          <label>
            Renk
            <input type="color" value={element.color} onChange={(e) => update({ color: e.target.value })} />
          </label>
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

function Suggestions({ text, onPick }: { text: string; onPick: (id: string) => void }) {
  const hits = searchSymbols(text, 6);
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
