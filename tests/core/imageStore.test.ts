import { describe, expect, it } from "vitest";
import { newProject } from "../../src/core/document";
import { createMemoryImageStore, imageSize, ingestImage, sha256Hex, sniffImage, MAX_IMAGE_BYTES, MAX_SVG_BYTES } from "../../src/core/imageStore";
import { exportProject, importProject } from "../../src/core/projectFile";
import { loadCustomSymbols } from "../../src/library/symbols/custom";
import { memoryStorage, tmpl } from "../ui/helpers/deps";

export const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));
const JPEG_HEAD = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 20, 0, 30, 3]);
const text = (s: string) => new TextEncoder().encode(s);
const SVG = `<svg viewBox="0 0 1 1"><path d="M0 0L1 1" fill="#ff0000"/></svg>`;

describe("sniffImage", () => {
  it("PNG tanır", () => expect(sniffImage(PNG)).toBe("image/png"));
  it("JPEG tanır", () => expect(sniffImage(JPEG_HEAD)).toBe("image/jpeg"));
  it("SVG tanır", () => expect(sniffImage(text(`<?xml version="1.0"?>\n${SVG}`))).toBe("image/svg+xml"));
  it("GIF reddeder", () => expect(sniffImage(text("GIF89a"))).toBeNull());
  it("uzantıya bakmaz, HTML reddeder", () => expect(sniffImage(text("<html></html>"))).toBeNull());
});

describe("imageSize", () => {
  it("PNG boyutunu okur", () => expect(imageSize(PNG, "image/png")).toEqual({ widthPx: 1, heightPx: 1 }));
  it("JPEG boyutunu okur", () => expect(imageSize(JPEG_HEAD, "image/jpeg")).toEqual({ widthPx: 30, heightPx: 20 }));
});

describe("ingestImage", () => {
  it("PNG'yi özet anahtarıyla saklar", async () => {
    const store = createMemoryImageStore();
    const result = await ingestImage(PNG, "logo.png", store);
    if (result.kind !== "image") throw new Error(JSON.stringify(result));
    expect(result.id).toBe(await sha256Hex(PNG));
    expect(result.meta).toEqual({ name: "logo.png", mime: "image/png", widthPx: 1, heightPx: 1 });
    expect(await store.get(result.id)).toEqual(PNG);
  });
  it("10 MB üstünü reddeder", async () => {
    const big = new Uint8Array(MAX_IMAGE_BYTES + 1);
    big.set(PNG);
    expect(await ingestImage(big, "x.png", createMemoryImageStore())).toEqual({ kind: "error", error: expect.stringContaining("10 MB") });
  });
  it("200 KB üstü SVG'yi reddeder", async () => {
    const big = text(SVG + " ".repeat(MAX_SVG_BYTES));
    expect(await ingestImage(big, "x.svg", createMemoryImageStore())).toEqual({ kind: "error", error: expect.stringContaining("200 KB") });
  });
  it("SVG'yi metin olarak döner", async () => expect(await ingestImage(text(SVG), "x.svg", createMemoryImageStore())).toEqual({ kind: "svg", text: SVG }));
  it("tanınmayan türü reddeder", async () => expect((await ingestImage(text("GIF89a"), "x.gif", createMemoryImageStore())).kind).toBe("error"));
  it("gömülemeyen dosyayı yükleme anında reddeder", async () => {
    const broken = new Uint8Array(40);
    broken.set(PNG.slice(0, 24));
    expect(await ingestImage(broken, "x.png", createMemoryImageStore())).toEqual({ kind: "error", error: expect.stringContaining("PDF") });
  });
  it("depolama yoksa açık mesaj verir", async () => {
    const store = { put: () => Promise.reject(new Error("yok")), get: () => Promise.resolve(undefined) };
    expect(await ingestImage(PNG, "x.png", store)).toEqual({ kind: "error", error: expect.stringContaining("depolama") });
  });
});

describe("taşınabilir dosya", () => {
  const meta = { name: "logo.png", mime: "image/png" as const, widthPx: 1, heightPx: 1 };

  it("görseli ve kullanılan özel SVG'yi taşır", async () => {
    const images = createMemoryImageStore();
    const hash = await sha256Hex(PNG);
    await images.put(hash, PNG);
    const project = newProject(tmpl("TW-2021"));
    project.images[hash] = meta;
    project.designs.d1.elements = [
      { kind: "symbol", id: "s", x: 0, y: 0, width: 5, height: 5, symbolId: "custom-1", color: "#000000" },
      { kind: "symbol", id: "u", x: 0, y: 0, width: 5, height: 5, symbolId: `upload:${hash}`, color: "#000000" },
    ];
    const custom = [
      { id: "custom-1", category: "Benim", tags: ["x"], icon: { viewBox: [0, 0, 1, 1] as [number, number, number, number], paths: [{ d: "M0 0", fill: true, strokeWidth: 0 }] } },
      { id: "custom-2", category: "Benim", tags: ["y"], icon: { viewBox: [0, 0, 1, 1] as [number, number, number, number], paths: [{ d: "M0 0", fill: true, strokeWidth: 0 }] } },
    ];
    const file = await exportProject(project, { images, customSymbols: custom });
    expect(JSON.parse(file).symbolData.map((s: { id: string }) => s.id)).toEqual(["custom-1"]);

    const target = createMemoryImageStore();
    const storage = memoryStorage();
    const result = await importProject(file, { images: target, storage });
    if (!result.ok) throw new Error(result.error);
    expect(result.warnings).toEqual([]);
    expect(await target.get(hash)).toEqual(PNG);
    expect(loadCustomSymbols(storage).map((s) => s.id)).toEqual(["custom-1"]);
    expect(result.project).not.toHaveProperty("imageData");
    expect(result.project).not.toHaveProperty("symbolData");
  });

  it("baytı olmayan görsel uyarıdır", async () => {
    const project = newProject(tmpl("TW-2021"));
    project.images.abc = meta;
    const result = await importProject(JSON.stringify(project), { images: createMemoryImageStore(), storage: memoryStorage() });
    expect(result.ok && result.warnings[0]).toContain("logo.png");
  });

  it("v1 dosyalarını açar, bozuk dosyayı reddeder", async () => {
    const deps = { images: createMemoryImageStore(), storage: memoryStorage() };
    expect((await importProject("{", deps)).ok).toBe(false);
    expect((await importProject(JSON.stringify({ ...newProject(tmpl("TW-2021")), imageData: { a: 5 } }), deps)).ok).toBe(false);
  });
});
