import { useState } from "react";
import { currentPage, useAppState, type Store } from "./store";

const FIELDS = [
  ["x", "X"],
  ["y", "Y"],
  ["width", "Genişlik"],
  ["height", "Yükseklik"],
] as const;

export function ZonesPanel({ store }: { store: Store }) {
  const state = useAppState(store);
  const [rect, setRect] = useState({ x: 10, y: 200, width: 190, height: 80 });
  const valid = FIELDS.every(([key]) => Number.isFinite(rect[key])) && rect.width > 0 && rect.height > 0;
  return (
    <div className="zones">
      <p className="hint">Kağıdın bir bölümüne serbest içerik koyun. Etiket ızgarasını kullanmayacağınız yerleri "Yaprak" görünümünde kapatın.</p>
      <ul>
        {currentPage(state).zones.map((zone, i) => (
          <li key={i} className="row">
            <span>{zone.kind === "grid" ? `Izgara: ${zone.templateId}` : `Serbest ${zone.width}×${zone.height} mm`}</span>
            <button onClick={() => store.setActive(zone.kind === "free" ? { zone: i } : null)}>Düzenle</button>
            <button onClick={() => store.removeZone(i)}>Sil</button>
          </li>
        ))}
      </ul>
      <div className="fields">
        {FIELDS.map(([key, label]) => (
          <label key={key}>
            {label} (mm)
            <input type="number" value={rect[key]} onChange={(e) => setRect({ ...rect, [key]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <button disabled={!valid} onClick={() => store.addFreeZone(rect)}>
        Serbest bölge ekle
      </button>
    </div>
  );
}
