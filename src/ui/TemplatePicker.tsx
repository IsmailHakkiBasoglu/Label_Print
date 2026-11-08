import { useMemo, useState } from "react";
import { searchTemplates } from "../core/customTemplates";
import type { Template } from "../core/templates";

type Props = { templates: Template[]; selectedId: string; onSelect: (t: Template) => void };

export function TemplatePicker({ templates, selectedId, onSelect }: Props) {
  const [query, setQuery] = useState("");
  const list = useMemo(() => searchTemplates(query, templates), [query, templates]);
  return (
    <div className="picker">
      <input aria-label="Şablon ara" placeholder="Kod veya ölçü: 2021, 63,5 38" value={query} onChange={(e) => setQuery(e.target.value)} />
      <ul>
        {list.map((t) => (
          <li key={t.id}>
            <button className={t.id === selectedId ? "row selected" : "row"} onClick={() => onSelect(t)}>
              <strong>{t.id}</strong>
              <span>
                {t.label.width}×{t.label.height} · {t.grid.columns}×{t.grid.rows}
              </span>
            </button>
            {t.status === "check" && (
              <div className="check">
                <span className="badge">Kontrol et</span> <small>{t.notes?.join(" ")}</small>
              </div>
            )}
          </li>
        ))}
        {list.length === 0 && <li className="empty">Şablon bulunamadı.</li>}
      </ul>
    </div>
  );
}
