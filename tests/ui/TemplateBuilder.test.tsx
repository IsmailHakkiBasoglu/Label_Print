// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TemplateBuilder } from "../../src/ui/TemplateBuilder";

afterEach(cleanup);

const save = () => screen.getByRole("button", { name: "Şablonu kaydet" }) as HTMLButtonElement;

describe("TemplateBuilder", () => {
  it("blocks saving a grid that overflows and says why", () => {
    render(<TemplateBuilder onSave={() => {}} />);
    fireEvent.change(screen.getByLabelText("Sütun"), { target: { value: "50" } });
    expect(save().disabled).toBe(true);
    expect(screen.getByRole("alert").textContent).toMatch(/genişliğini aşıyor/);
  });

  it("saves a valid template as custom", () => {
    const onSave = vi.fn();
    render(<TemplateBuilder onSave={onSave} />);
    fireEvent.change(screen.getByLabelText("Şablon adı"), { target: { value: "Kavanoz" } });
    fireEvent.click(save());
    expect(onSave.mock.calls[0][0]).toMatchObject({ name: "Kavanoz", source: "custom", status: "verified" });
    expect(onSave.mock.calls[0][0].id).toMatch(/^custom-/);
  });

  it("requires a name", () => {
    render(<TemplateBuilder onSave={() => {}} />);
    fireEvent.change(screen.getByLabelText("Şablon adı"), { target: { value: " " } });
    expect(save().disabled).toBe(true);
  });
});
