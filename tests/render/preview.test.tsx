// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { newProject } from "../../src/core/document";
import { layoutProject } from "../../src/render/layout";
import { SheetPreview } from "../../src/render/preview";
import { deps, tmpl } from "../ui/helpers/deps";

afterEach(cleanup);

const page = () => layoutProject(newProject(tmpl("TW-2021")), deps, { guides: true }).pages[0];

describe("SheetPreview", () => {
  it("uses a millimetre viewBox", () => {
    const { container } = render(<SheetPreview page={page()} />);
    expect(container.querySelector("svg")!.getAttribute("viewBox")).toBe("0 0 210 297");
  });

  it("draws guides exactly where layout puts them", () => {
    const p = page();
    const { container } = render(<SheetPreview page={p} />);
    const rect = container.querySelectorAll("rect.guide")[4];
    const guide = p.ops.filter((o) => o.kind === "guide")[4];
    expect(guide.kind === "guide" && Number(rect.getAttribute("x"))).toBe(guide.kind === "guide" && guide.rect.x);
    expect(guide.kind === "guide" && Number(rect.getAttribute("y"))).toBe(guide.kind === "guide" && guide.rect.y);
  });

  it("reports clicked cells", () => {
    const onCellClick = vi.fn();
    const cells = [{ x: 1, y: 2, width: 3, height: 4 }];
    const { container } = render(<SheetPreview page={page()} cells={cells} usedCells={[0]} onCellClick={onCellClick} />);
    fireEvent.click(container.querySelector("rect.cell")!);
    expect(onCellClick).toHaveBeenCalledWith(0);
  });
});
