import { useState } from "react";
import { labelRects } from "../core/geometry";
import { validateTemplate, type Shape, type Template } from "../core/templates";
import { SheetPreview } from "../render/preview";

const NUMBER_FIELDS = [
  ["sheetWidth", "Kağıt genişliği"],
  ["sheetHeight", "Kağıt yüksekliği"],
  ["width", "Etiket genişliği"],
  ["height", "Etiket yüksekliği"],
  ["columns", "Sütun"],
  ["rows", "Satır"],
  ["marginLeft", "Sol boşluk"],
  ["marginTop", "Üst boşluk"],
  ["gapX", "Yatay aralık"],
  ["gapY", "Dikey aralık"],
] as const;

const INITIAL = { sheetWidth: 210, sheetHeight: 297, width: 70, height: 37, columns: 3, rows: 8, marginLeft: 0, marginTop: 0.5, gapX: 0, gapY: 0 };

export function TemplateBuilder({ onSave }: { onSave: (t: Template) => void }) {
  const [name, setName] = useState("Yeni şablon");
  const [shape, setShape] = useState<Shape>("rect");
  const [v, setV] = useState(INITIAL);
  const template: Template = {
    id: `custom-${Date.now()}`,
    name: name.trim(),
    sheet: { width: v.sheetWidth, height: v.sheetHeight },
    grid: { columns: v.columns, rows: v.rows, marginLeft: v.marginLeft, marginTop: v.marginTop, gapX: v.gapX, gapY: v.gapY },
    label: { width: v.width, height: v.height, shape, ...(shape === "rounded" ? { cornerRadius: 2 } : {}) },
    source: "custom",
    status: "verified",
  };
  const errors = validateTemplate(template);
  return (
    <div className="builder">
      <label>
        Şablon adı
        <input value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <label>
        Şekil
        <select value={shape} onChange={(e) => setShape(e.target.value as Shape)}>
          <option value="rect">Dikdörtgen</option>
          <option value="rounded">Yuvarlak köşeli</option>
          <option value="circle">Daire</option>
          <option value="oval">Oval</option>
        </select>
      </label>
      <div className="fields">
        {NUMBER_FIELDS.map(([key, label]) => (
          <label key={key}>
            {label}
            <input type="number" step="0.01" value={Number.isNaN(v[key]) ? "" : v[key]} onChange={(e) => setV({ ...v, [key]: e.target.value === "" ? NaN : Number(e.target.value) })} />
          </label>
        ))}
      </div>
      {errors.length > 0 && <div role="alert" className="error">{errors.join(" ")}</div>}
      {errors.length === 0 && <SheetPreview page={{ sheet: template.sheet, ops: labelRects(template).map((rect) => ({ kind: "guide" as const, rect, shape })) }} />}
      <button className="primary" disabled={errors.length > 0 || !name.trim()} onClick={() => onSave(template)}>
        Şablonu kaydet
      </button>
    </div>
  );
}
