import { useContext, useMemo, useState, type ChangeEvent } from "react";
import { ingestImage } from "../core/imageStore";
import { exportCustom, importCustom, saveCustom } from "../core/customTemplates";
import { browserStorage } from "../core/storage";
import type { Template } from "../core/templates";
import { FRAMES, frameOps } from "../library/frames";
import { ORNAMENT_CATEGORIES, ORNAMENTS } from "../library/ornaments/frames.data";
import { importCustomSymbol } from "../library/symbols/custom";
import { catalog, searchSymbols, type SymbolEntry } from "../library/symbols/search";
import { isMultiColor } from "../library/symbols/svg";
import { PATTERNS } from "../library/textPatterns";
import type { RenderDeps } from "../render/pdf";
import { ImageUrlContext, OpsView } from "../render/preview";
import { IconView } from "./IconView";
import { activeLabel } from "./LabelEditor";
import { activeDesign, cellsLostBy, currentGrid, useAppState, type Store } from "./store";
import { TemplateBuilder } from "./TemplateBuilder";
import { TemplatePicker } from "./TemplatePicker";
import { ZonesPanel } from "./ZonesPanel";

const TABS = ["Şablon", "Çerçeve", "Desen", "Sembol", "Bölge"] as const;
const DEFAULT_FRAME = { strokeMm: 0.4, insetMm: 1, color: "#000000" };
const LINE_FRAMES = "__lines";

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
      {tab === "Çerçeve" && <FramesTab store={store} deps={deps} />}
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
      {tab === "Sembol" && <SymbolsTab store={store} deps={deps} customSymbols={customSymbols} onLibraryChanged={onLibraryChanged} />}
      {tab === "Bölge" && <ZonesPanel store={store} />}
    </aside>
  );
}

function TemplatesTab({ store, templates, onLibraryChanged }: Pick<Props, "store" | "templates" | "onLibraryChanged">) {
  const state = useAppState(store);
  const [building, setBuilding] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const zone = currentGrid(state);

  function choose(template: Template) {
    const lost = cellsLostBy(state.project, template.grid.columns * template.grid.rows);
    if (lost === 0 || window.confirm(`Bu şablona sığmayan ${lost} etiketin içeriği silinecek. Devam edilsin mi?`)) store.setTemplate(template);
  }

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = importCustom(await file.text(), templates, browserStorage());
    onLibraryChanged();
    setMessage([`${result.added.length} şablon eklendi.`, ...result.renamed.map((id) => `${id} adı çakıştı, yeni kod verildi.`), ...result.errors].join(" "));
  }

  function exportFile() {
    const url = URL.createObjectURL(new Blob([exportCustom(browserStorage())], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "ozel-sablonlar.json";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div>
      <div className="actions">
        <button onClick={() => setBuilding(!building)}>{building ? "Listeye dön" : "+ Yeni şablon"}</button>
        <label className="file-button">
          İçe aktar
          <input type="file" accept=".json" onChange={importFile} />
        </label>
        <button onClick={exportFile}>Dışa aktar</button>
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
        <TemplatePicker templates={templates} selectedId={zone?.templateId ?? ""} onSelect={choose} />
      )}
    </div>
  );
}

function FramesTab({ store, deps }: { store: Store; deps: RenderDeps }) {
  const state = useAppState(store);
  const [category, setCategory] = useState<string>(LINE_FRAMES);
  const design = activeDesign(state);
  const options = design.frameOptions ?? DEFAULT_FRAME;
  const change = (patch: Partial<typeof DEFAULT_FRAME>) => store.setFrame(design.frameId, { ...options, ...patch });
  const label = activeLabel(store, deps);
  const previewOptions = { ...options, color: "#20241f" };
  return (
    <div className="list">
      <button className={design.frameId ? "row" : "row selected"} onClick={() => store.setFrame(undefined, undefined)}>
        Çerçevesiz
      </button>
      <label>
        Çerçeve türü
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value={LINE_FRAMES}>Düz çizgiler</option>
          {ORNAMENT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c[0].toLocaleUpperCase("tr") + c.slice(1)}
            </option>
          ))}
        </select>
      </label>
      {category === LINE_FRAMES ? (
        FRAMES.map((f) => (
          <button key={f.id} className={design.frameId === f.id ? "row selected" : "row"} onClick={() => store.setFrame(f.id, options)}>
            {f.name}
          </button>
        ))
      ) : (
        <div className="frame-grid">
          {ORNAMENTS.filter((o) => o.category === category).map((o) => (
            <button key={o.id} className={design.frameId === o.id ? "frame-card selected" : "frame-card"} onClick={() => store.setFrame(o.id, options)}>
              <svg viewBox={`0 0 ${label.width} ${label.height}`} aria-hidden="true">
                <OpsView ops={frameOps(o.id, label, previewOptions)} />
              </svg>
              {o.name}
            </button>
          ))}
        </div>
      )}
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

function SymbolsTab({ store, deps, customSymbols, onLibraryChanged }: Pick<Props, "store" | "deps" | "customSymbols" | "onLibraryChanged">) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [colored, setColored] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const imageUrl = useContext(ImageUrlContext);
  const uploads = Object.entries(useAppState(store).project.images);
  const all = useMemo(() => {
    const mine = customSymbols.filter((s) => isMultiColor(s.icon) === colored);
    return [...mine, ...(colored ? (deps.colorSymbols ?? []) : catalog)];
  }, [customSymbols, colored, deps.colorSymbols]);
  const categories = useMemo(() => [...new Set(all.map((s) => s.category))], [all]);
  const list = query.trim() ? searchSymbols(query, 60, all) : all.filter((s) => !category || s.category === category);

  async function importFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!deps.images) return setMessage("Tarayıcı depolaması kullanılamıyor; görsel kaydedilemedi.");
    const result = await ingestImage(new Uint8Array(await file.arrayBuffer()), file.name, deps.images);
    if (result.kind === "error") return setMessage(result.error);
    if (result.kind === "image") {
      store.addImage(result.id, result.meta);
      return setMessage(`${file.name} eklendi. "Renkli" bölümünden yeniden seçebilirsiniz.`);
    }
    const symbol = importCustomSymbol(result.text, file.name.replace(/\.svg$/i, ""), browserStorage());
    setMessage("error" in symbol ? symbol.error : "Sembol eklendi.");
    onLibraryChanged();
  }

  return (
    <div>
      <div className="actions">
        <button className={colored ? "" : "selected"} onClick={() => (setColored(false), setCategory(""))}>
          Tek renk
        </button>
        <button className={colored ? "selected" : ""} onClick={() => (setColored(true), setCategory(""))}>
          Renkli
        </button>
      </div>
      <input aria-label="Sembol ara" placeholder="Ara: mısır, zeytin, kutu…" value={query} onChange={(e) => setQuery(e.target.value)} />
      <div className="actions">
        <select aria-label="Kategori" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Tüm kategoriler</option>
          {categories.map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <label className="file-button">
          Görsel ekle
          <input type="file" accept=".png,.jpg,.jpeg,.svg" onChange={importFile} />
        </label>
      </div>
      {message && <p className="notice">{message}</p>}
      {colored && uploads.length > 0 && (
        <div className="icons grid">
          {uploads.map(([id, meta]) => (
            <button key={id} title={meta.name} aria-label={`Görsel ekle: ${meta.name}`} onClick={() => store.pickSymbol(`upload:${id}`)}>
              <img src={imageUrl(id)} alt="" width={26} height={26} className="upload-thumb" />
            </button>
          ))}
        </div>
      )}
      <div className="icons grid">
        {list.map((s) => (
          <button key={s.id} title={s.tags.join(", ")} aria-label={`Sembol ekle: ${s.id}`} onClick={() => store.pickSymbol(s.id)}>
            <IconView icon={s.icon} />
          </button>
        ))}
      </div>
    </div>
  );
}
