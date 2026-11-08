import type { VectorIcon } from "../library/symbols/svg";

export function IconView({ icon }: { icon: VectorIcon }) {
  return (
    <svg viewBox={icon.viewBox.join(" ")} width="26" height="26" aria-hidden="true">
      {icon.paths.map((p, i) => (
        <path key={i} d={p.d} fill={p.fill ? "currentColor" : "none"} stroke={p.strokeWidth ? "currentColor" : "none"} strokeWidth={p.strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
