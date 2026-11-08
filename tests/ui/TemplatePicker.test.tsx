// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { tanexTemplates } from "../../src/core/catalog";
import { searchTemplates } from "../../src/core/customTemplates";
import { TemplatePicker } from "../../src/ui/TemplatePicker";
import { tmpl } from "./helpers/deps";

afterEach(cleanup);

describe("searchTemplates", () => {
  it("finds by code", () => expect(searchTemplates("2021", tanexTemplates).map((t) => t.id)).toContain("TW-2021"));
  it("finds by size with a comma", () => expect(searchTemplates("63,5 38", tanexTemplates).map((t) => t.id)).toContain("TW-2021"));
  it("returns everything for an empty query", () => expect(searchTemplates(" ", tanexTemplates)).toHaveLength(159));
  it("finds nothing for unknown text", () => expect(searchTemplates("zzz", tanexTemplates)).toHaveLength(0));
});

describe("TemplatePicker", () => {
  it("shows the check badge with its reason", () => {
    render(<TemplatePicker templates={[tmpl("TW-2163")]} selectedId="" onSelect={() => {}} />);
    expect(screen.getByText("Kontrol et")).toBeTruthy();
    expect(screen.getByText(/Izgara okunamadı/)).toBeTruthy();
  });

  it("selects a template", () => {
    const onSelect = vi.fn();
    render(<TemplatePicker templates={[tmpl("TW-2021")]} selectedId="" onSelect={onSelect} />);
    fireEvent.click(screen.getByRole("button", { name: /TW-2021/ }));
    expect(onSelect).toHaveBeenCalledWith(tmpl("TW-2021"));
  });
});
