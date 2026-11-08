import { useMemo, useState, type ChangeEvent } from "react";
import { importCustom, saveCustom } from "../core/customTemplates";
import { browserStorage } from "../core/storage";
import type { Template } from "../core/templates";
import { FRAMES } from "../library/frames";
import { importCustomSymbol } from "../library/symbols/custom";
import { catalog, searchSymbols, type SymbolEntry } from "../library/symbols/search";
import { PATTERNS } from "../library/textPatterns";
import type { RenderDeps } from "../render/pdf";
import { IconView } from "./IconView";
import { activeLabel } from "./LabelEditor";
import { activeDesign, useAppState, type Store } from "./store";
import { TemplateBuilder } from "./TemplateBuilder";
import { TemplatePicker } from "./TemplatePicker";
import { ZonesPanel } from "./ZonesPanel";

const TABS = ["Şablon", "Çerçeve", "Desen", "Sembol", "Bölge"] as const;
const DEFAULT_FRAME = { strokeMm: 0.4, insetMm: 1, color: "#000000" };

type Props = {
  store: Store;
  deps: RenderDeps;
  templates: Template[];
  customSymbols: SymbolEntry[];
  onLibraryChanged: () => void;
};

export function LibraryPanel({ store, deps, templates, customSymbols, onLibraryChanged }: Props) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Şablon");
  return (
    <aside className="panel library">
      <nav className="tabs">
        {TABS.map((t) => (
          <button key={t} className={t === tab ? "selected" : ""} onClick={() => setTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      {tab === "Şablon" && <TemplatesTab store={store} templates={templates} onLibraryChanged={onLibraryChanged} />}
      {tab === "Çerçeve" && <FramesTab store={store} />}
      {tab === "Desen" && (
        <div className="list">
          {PATTERNS.map((p) => (
            <button key={p.id} className="row" onClick={() => store.applyPattern(p.id, activeLabel(store, deps))}>
              {p.name}
            </button>
          ))}
          <p className="hint">Desen, etiketteki yazıları ve ilk sembolü korur, yerleşimi yeniden kurar.</p>
        </div>
      )}
      {tab === "Sembol" && <SymbolsTab store={store} customSymbols={customSymbols} onLibraryChanged={onLibraryChanged} />}
      {tab === "Bölge" && <ZonesPanel store={store} />}
    </aside>
  );
}

function TemplatesTab({ store, templates, onLibraryChanged }: Pick<Props, "store" | "templates" | "onLibraryChanged">) {
  const state = useAppState(store);
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const zone = state.project.pages[0].zones.find((z) => z.kind === "grid");

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = importCustom(await file.text(), templates, browserStorage());
    onLibraryChanged();
    setMessage([`${result.added.length} şablon eklendi.`, ...result.renamed.map((id) => `${id} adı çakıştı, yeni kod verildi.`), ...result.errors].join(" "));
  }

  return (
    <div>
      <div className="actions">
        <button onClick={() => setBuilding(!building)}>{building ? "Listeye dön" : "+ Yeni şablon"}</button>
        <label className="file-button">
          İçe aktar
          <input type="file" accept=".json" onChange={importFile} />
        </label>
      </div>
      {message && <p className="notice">{message}</p>}
      {building ? (
        <TemplateBuilder
          onSave={(t) => {
            saveCustom(t, browserStorage());
            onLibraryChanged();
            store.setTemplate(t);
            setBuilding(false);
          }}
        />
      ) : (
        <TemplatePicker templates={templates} selectedId={zone?.kind === "grid" ? zone.templateId : ""} onSelect={(t) => store.setTemplate(t)} />
      )}
    </div>
  );
}

function FramesTab({ store }: { store: Store }) {
  const state = useAppState(store);
  const design = activeDesign(state);
  const options = design.frameOptions ?? DEFAULT_FRAME;
  const change = (patch: Partial<typeof DEFAULT_FRAME>) => store.setFrame(design.frameId, { ...options, ...patch });
  return (
    <div className="list">
      <button className={design.frameId ? "row" : "row selected"} onClick={() => store.setFrame(undefined, undefined)}>
        Çerçevesiz
      </button>
      {FRAMES.map((f) => (
        <button key={f.id} className={design.frameId === f.id ? "row selected" : "row"} onClick={() => store.setFrame(f.id, options)}>
          {f.name}
        </button>
      ))}
      <div className="fields">
        <label>
          Kalınlık (mm)
          <input type="number" step="0.1" min="0.1" value={options.strokeMm} onChange={(e) => Number(e.target.value) > 0 && change({ strokeMm: Number(e.target.value) })} />
        </label>
        <label>
          İç boşluk (mm)
          <input type="number" step="0.5" min="0" value={options.insetMm} onChange={(e) => Number(e.target.value) >= 0 && change({ insetMm: Number(e.target.value) })} />
        </label>
        <label>
          Renk
          <input type="color" value={options.color} onChange={(e) => change({ color: e.target.value })} />
        </label>
      </div>
    </div>
  );
}

function SymbolsTab({ store, customSymbols, onLibraryChanged }: Pick<Props, "store" | "customSymbols" | "onLibraryChanged">) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const all = useMemo(() => [...customSymbols, ...catalog], [customSymbols]);
  const categories = useMemo(() => [...new Set(all.map((s) => s.category))], [all]);
  const list = query.trim() ? searchSymbols(query, 60, all) : all.filter((s) => !category || s.category === category);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = importCustomSymbol(await file.text(), file.name.replace(/\.svg$/i, ""), browserStorage());
    setMessage("error" in result ? result.error : "Sembol eklendi.");
    onLibraryChanged();
  }

  return (
    <div>
      <input aria-label="Sembol ara" placeholder="Ara: mısır, zeytin, kutu…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="actions">
        <select aria-label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Tüm kategoriler</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="file-button">
          SVG ekle
          <input type="file" accept=".svg" onChange={importFile} />
        </label>
      </div>
      {message && <p className="notice">{message}</p>}
      <div className="icons grid">
        {list.map((s) => (
          <button key={s.id} title={s.tags.join(", ")} aria-label={`Sembol ekle: ${s.id}`} onClick={() => store.addSymbol(s.id)}>
            <IconView icon={s.icon} />
          </button>
        ))}
      </div>
    </div>
  );
}
