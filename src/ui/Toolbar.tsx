import { useState, type ChangeEvent } from "react";
import { parseProject, serialize } from "../core/document";
import { calibrationPdf } from "../render/calibration";
import { renderPdf, type RenderDeps } from "../render/pdf";
import { useAppState, type Store } from "./store";

function download(content: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function Toolbar({ store, deps }: { store: Store; deps: RenderDeps }) {
  const state = useAppState(store);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState<{ bytes: Uint8Array; warnings: string[] } | null>(null);
  const { x, y } = state.project.printOffset;

  async function makePdf() {
    setError(null);
    try {
      const result = await renderPdf(state.project, deps, { guides: state.guides });
      if (result.ok) setReady(result);
      else setError(result.errors.join(" "));
    } catch (e) {
      setError(`PDF oluşturulamadı: ${(e as Error).message}`);
    }
  }

  async function open(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    const result = parseProject(await file.text());
    if (result.ok) {
      setError(null);
      store.load(result.project);
    } else {
      setError(result.error);
    }
  }

  const offsetField = (axis: "x" | "y", value: number) => (
    <label className="inline">
      {axis.toUpperCase()}
      <input
        type="number"
        step="0.1"
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (e.target.value !== "" && Number.isFinite(n)) store.setOffset({ x, y, [axis]: n });
        }}
      />
    </label>
  );

  return (
    <header className="toolbar">
      <h1>Label Print</h1>
      <button disabled={!state.canUndo} onClick={() => store.undo()}>
        Geri
      </button>
      <button disabled={!state.canRedo} onClick={() => store.redo()}>
        İleri
      </button>
      <button onClick={() => download(serialize(state.project), "etiket.labelprint.json", "application/json")}>Kaydet</button>
      <label className="file-button">
        Aç
        <input type="file" accept=".json" onChange={open} />
      </label>
      <span className="spacer" />
      <label className="inline">
        <input type="checkbox" checked={state.guides} onChange={(e) => store.setGuides(e.target.checked)} /> PDF'e kılavuz çizgileri
      </label>
      <span className="group" title="Yazıcı kayması için milimetre düzeltmesi">
        Yazıcı düzeltmesi {offsetField("x", x)} {offsetField("y", y)}
      </span>
      <button onClick={async () => download(await calibrationPdf(state.project.pages[0].sheet, deps.fontBytes) as BlobPart, "kalibrasyon.pdf", "application/pdf")}>Kalibrasyon</button>
      <button className="primary" onClick={makePdf}>
        PDF Al
      </button>
      {error && (
        <div role="alert" className="error banner">
          {error}
        </div>
      )}
      {ready && (
        <div className="dialog" role="dialog" aria-label="PDF hazır">
          <h2>PDF hazır</h2>
          {ready.warnings.length > 0 && (
            <ul className="warnings">
              {ready.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          )}
          <p>
            Yazdırırken ölçek olarak <strong>Gerçek boyut / %100</strong> seçin. "Sayfaya sığdır" ölçüleri bozar.
          </p>
          <button
            className="primary"
            onClick={() => {
              download(ready.bytes as BlobPart, "etiket.pdf", "application/pdf");
              setReady(null);
            }}
          >
            İndir
          </button>
          <button onClick={() => setReady(null)}>Vazgeç</button>
        </div>
      )}
    </header>
  );
}
