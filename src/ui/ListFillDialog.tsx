import { useId, useMemo, useState, type ReactNode } from "react";
import type { TextElement } from "../core/document";
import { fillWouldReplace, previewTableFill, rowsFromTable, type ListFillOptions } from "../core/listFill";
import { parsePasted, readTableFile, TableImportError, toTable, type TableFile } from "../core/tableImport";
import { searchSymbols } from "../library/symbols/search";
import { isMultiColor } from "../library/symbols/svg";
import type { RenderDeps } from "../render/pdf";
import { currentGrid, useAppState, type Store } from "./store";

type Props = { store: Store; deps: RenderDeps; capacity: number; label: { width: number; height: number }; onClose: () => void };
const SHARED = "ortak";
const PREVIEW_ROWS = 3;

function describe(r: ReturnType<typeof previewTableFill>): string {
  return [
    `${r.filled} etiket dolacak`,
    r.pagesAdded > 0 ? `${r.pagesAdded} yeni sayfa açılacak` : "",
    r.unusedCells > 0 ? `${r.unusedCells} etiket boş kalacak` : "",
    r.noSymbol > 0 ? `${r.noSymbol} satır için görsel bulunamadı` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function readBytes(file: File): Promise<Uint8Array> {
  if (typeof file.arrayBuffer === "function") return file.arrayBuffer().then((b) => new Uint8Array(b));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function Choice({ label, value, onChange, children }: { label: string; value: string; onChange: (value: string) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="mapping-row">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {children}
      </select>
    </div>
  );
}

const fieldName = (index: number, element: TextElement | undefined) => {
  const sample = element?.text.trim().split("\n")[0];
  return `${index + 1}. yazı alanı${sample ? ` · “${sample.length > 18 ? `${sample.slice(0, 18)}…` : sample}”` : element ? "" : " (eklenecek)"}`;
};

export function ListFillDialog({ store, deps, capacity, label, onClose }: Props) {
  const state = useAppState(store);
  const [text, setText] = useState("");
  const [file, setFile] = useState<{ name: string; data: TableFile } | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [header, setHeader] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wantSuggest, setWantSuggest] = useState(true);
  // Field index → column index, or null for "keep shared". Missing entries use the default (same position).
  const [textMap, setTextMap] = useState<Record<number, number | null>>({});
  const [keyMap, setKeyMap] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  const grid = currentGrid(state);
  const design = grid ? state.project.designs[grid.designId] : undefined;
  const textElements = (design?.elements ?? []).filter((e): e is TextElement => e.kind === "text");
  const hasSymbol = !!design?.elements.some((e) => e.kind === "symbol");

  const table = useMemo(() => toTable(file ? (file.data.sheets[sheetIndex]?.rows ?? []) : parsePasted(text), header), [file, sheetIndex, text, header]);
  const columnCount = table.columns.length;
  const fieldCount = Math.max(textElements.length, 1);
  const textColumns = Array.from({ length: fieldCount }, (_, i) => {
    const chosen = textMap[i];
    if (chosen === null) return null;
    if (chosen !== undefined && chosen < columnCount) return chosen;
    return i < columnCount ? i : null;
  });
  const suggesting = wantSuggest && hasSymbol;
  const keyColumn = suggesting ? (keyMap !== null && keyMap < columnCount ? keyMap : 0) : null;
  const rows = useMemo(
    () => rowsFromTable(table, textColumns, keyColumn),
    // `textColumns` is derived each render from exactly these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [table, JSON.stringify(textColumns), keyColumn],
  );

  const isColored = (id: string) => {
    if (id.startsWith("color:") || id.startsWith("upload:")) return true;
    const symbol = deps.symbols(id);
    return !!symbol && isMultiColor(symbol.icon);
  };
  const options: Omit<ListFillOptions, "newId"> = {
    cellCount: capacity,
    label,
    ...(suggesting ? { suggest: (key: string, sample: string) => searchSymbols(key, 1, isColored(sample) ? deps.colorSymbols : undefined)[0]?.id ?? null } : {}),
  };
  const report = useMemo(
    () => (rows.length ? previewTableFill(state.project, state.pageIndex, rows, { ...options, newId: () => "onizleme" }) : null),
    // `options` is rebuilt each render from exactly these inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, suggesting, state.project, state.pageIndex, capacity, deps],
  );

  const used = new Set([...textColumns, keyColumn].filter((c): c is number => c !== null));
  const unused = columnCount - used.size;
  const showMapping = columnCount > 1 || !!file || header;

  function changed() {
    setConfirming(false);
  }

  async function pickFile(input: HTMLInputElement) {
    const picked = input.files?.[0];
    input.value = "";
    if (!picked) return;
    try {
      const data = await readTableFile(picked.name, await readBytes(picked));
      setFile({ name: picked.name, data });
      setSheetIndex(0);
      setHeader(true);
      setTextMap({});
      setKeyMap(null);
      setError(null);
    } catch (e) {
      setError(e instanceof TableImportError ? e.message : "Dosya okunamadı.");
    }
    changed();
  }

  function removeFile() {
    setFile(null);
    setHeader(false);
    setTextMap({});
    setKeyMap(null);
    changed();
  }

  function fill() {
    if (fillWouldReplace(state.project) && !confirming) {
      setConfirming(true);
      return;
    }
    store.fillFromTable(rows, options);
    onClose();
  }

  const columnOptions = table.columns.map((name, i) => (
    <option key={i} value={String(i)}>
      {name}
    </option>
  ));

  return (
    <div className="dialog list-fill" role="dialog" aria-label="Listeden doldur">
      <h2>Listeden doldur</h2>
      {file ? (
        <div className="file-chip">
          <span>
            {file.name} · {table.rows.length} satır
          </span>
          <button onClick={removeFile}>Dosyayı kaldır</button>
        </div>
      ) : (
        <label>
          Liste (her satır bir etiket)
          <textarea
            rows={8}
            value={text}
            placeholder={"Mısır\nNohut\n…\nExcel'den kopyalanan sütunlar da olur."}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
              changed();
            }}
          />
        </label>
      )}
      <label className="file-pick">
        Dosyadan al (.xlsx, .csv)
        <input type="file" accept=".xlsx,.csv" onChange={(e) => void pickFile(e.currentTarget)} />
      </label>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      {file && file.data.sheets.length > 1 && (
        <Choice
          label="Sayfa"
          value={String(sheetIndex)}
          onChange={(v) => {
            setSheetIndex(Number(v));
            setTextMap({});
            setKeyMap(null);
            changed();
          }}
        >
          {file.data.sheets.map((s, i) => (
            <option key={i} value={String(i)}>
              {s.name || `Sayfa ${i + 1}`}
            </option>
          ))}
        </Choice>
      )}
      <label className="inline">
        <input
          type="checkbox"
          checked={header}
          onChange={(e) => {
            setHeader(e.target.checked);
            changed();
          }}
        />{" "}
        İlk satır başlık
      </label>
      <label className="inline">
        <input type="checkbox" checked={suggesting} disabled={!hasSymbol} onChange={(e) => setWantSuggest(e.target.checked)} /> Sembol öner
      </label>
      {!hasSymbol && <p className="hint">Önce ortak tasarıma bir görsel ekleyin; hücreler onun yerini kullanır.</p>}

      {showMapping && columnCount > 0 && (
        <fieldset className="mapping">
          <legend>Sütunlar</legend>
          {textColumns.map((column, i) => (
            <Choice
              key={i}
              label={fieldName(i, textElements[i])}
              value={column === null ? SHARED : String(column)}
              onChange={(v) => {
                setTextMap({ ...textMap, [i]: v === SHARED ? null : Number(v) });
                changed();
              }}
            >
              <option value={SHARED}>Ortak kalsın</option>
              {columnOptions}
            </Choice>
          ))}
          {suggesting && (
            <Choice
              label="Öneri sütunu (görsel)"
              value={String(keyColumn)}
              onChange={(v) => {
                setKeyMap(Number(v));
                changed();
              }}
            >
              {columnOptions}
            </Choice>
          )}
          {unused > 0 && (
            <p className="hint">
              {columnCount} sütunun {unused} tanesi kullanılmıyor.
              {columnCount > fieldCount && " Daha çok yazı alanı için önce bir desen seçin ya da yazı ekleyin."}
            </p>
          )}
        </fieldset>
      )}

      {showMapping && rows.length > 0 && (
        <table className="fill-preview" aria-label="Önizleme">
          <tbody>
            {rows.slice(0, PREVIEW_ROWS).map((row, r) => (
              <tr key={r}>
                {row.texts.map((value, i) => (
                  <td key={i} className={value === null ? "shared" : ""}>
                    {value === null ? "(ortak)" : value || "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {report && (
        <p className="hint" role="status">
          {describe(report)}
        </p>
      )}
      {confirming && <p className="notice">Önceki liste içeriği ve listeyle açılan sayfalar değişecek.</p>}
      <div>
        <button className="primary" disabled={rows.length === 0} onClick={fill}>
          {confirming ? "Evet, değiştir" : "Doldur"}
        </button>
        <button onClick={onClose}>Vazgeç</button>
      </div>
    </div>
  );
}
