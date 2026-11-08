import { useEffect, useMemo, useState } from "react";
import { tanexTemplates } from "../core/catalog";
import { loadCustom } from "../core/customTemplates";
import { browserStorage } from "../core/storage";
import { loadCustomSymbols } from "../library/symbols/custom";
import { loadColorCatalog } from "../library/symbols/colorCatalog";
import { catalog, type SymbolEntry } from "../library/symbols/search";
import { createFontTools, FONT_FILES, loadFontBytes, type FontBytes } from "../render/fonts";
import type { RenderDeps } from "../render/pdf";
import { LabelEditor } from "./LabelEditor";
import { LibraryPanel } from "./LibraryPanel";
import { PropertiesPanel } from "./PropertiesPanel";
import { SheetView } from "./SheetView";
import { createStore } from "./store";
import { Toolbar } from "./Toolbar";
import "./app.css";

const DEFAULT_TEMPLATE = tanexTemplates.find((t) => t.id === "TW-2021")!;
const store = createStore(DEFAULT_TEMPLATE, browserStorage());

const base = import.meta.env.BASE_URL;
const fontFaces = `
@font-face{font-family:"LP Sans";font-weight:400;src:url("${base}fonts/${FONT_FILES.sans}")}
@font-face{font-family:"LP Sans";font-weight:700;src:url("${base}fonts/${FONT_FILES["sans-bold"]}")}
@font-face{font-family:"LP Serif";font-weight:400;src:url("${base}fonts/${FONT_FILES.serif}")}
@font-face{font-family:"LP Serif";font-weight:700;src:url("${base}fonts/${FONT_FILES["serif-bold"]}")}
`;

export function App() {
  const [fontBytes, setFontBytes] = useState<FontBytes | null>(null);
  const [colorSymbols, setColorSymbols] = useState<SymbolEntry[]>([]);
  const [failure, setFailure] = useState<string | null>(null);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    Promise.all([loadFontBytes(), loadColorCatalog()]).then(
      ([fonts, colored]) => {
        setColorSymbols(colored);
        setFontBytes(fonts);
      },
      (e: Error) => setFailure(e.message),
    );
  }, []);

  const custom = useMemo(() => loadCustom(browserStorage()), [revision]);
  const customSymbols = useMemo(() => loadCustomSymbols(browserStorage()), [revision]);
  const templates = useMemo(() => [...custom, ...tanexTemplates], [custom]);

  const deps = useMemo<RenderDeps | null>(() => {
    if (!fontBytes) return null;
    const symbols = [...customSymbols, ...catalog, ...colorSymbols];
    return {
      colorSymbols,
      templates: (id) => templates.find((t) => t.id === id),
      symbols: (id) => symbols.find((s) => s.id === id),
      tools: createFontTools(fontBytes),
      fontBytes,
    };
  }, [fontBytes, templates, customSymbols, colorSymbols]);

  if (failure) return <p role="alert" className="error banner">{failure}</p>;
  if (!deps) return <p className="loading">Yükleniyor…</p>;

  return (
    <div className="app">
      <style>{fontFaces}</style>
      <Toolbar store={store} deps={deps} />
      <main>
        <LibraryPanel store={store} deps={deps} templates={templates} customSymbols={customSymbols} onLibraryChanged={() => setRevision((r) => r + 1)} />
        <div className="workspace">
          <LabelEditor store={store} deps={deps} />
          <SheetView store={store} deps={deps} />
        </div>
        <PropertiesPanel store={store} deps={deps} />
      </main>
    </div>
  );
}
