import { PDFDocument } from "pdf-lib";
import type { ImageMeta } from "./document";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_SVG_BYTES = 200 * 1024;

export type ImageStore = { put(id: string, bytes: Uint8Array): Promise<void>; get(id: string): Promise<Uint8Array | undefined> };
type Mime = ImageMeta["mime"];
export type IngestResult = { kind: "image"; id: string; meta: ImageMeta } | { kind: "svg"; text: string } | { kind: "error"; error: string };

const startsWith = (bytes: Uint8Array, signature: number[]) => signature.every((b, i) => bytes[i] === b);

/** Decides by content, never by file name. */
export function sniffImage(bytes: Uint8Array): Mime | "image/svg+xml" | null {
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  const head = new TextDecoder().decode(bytes.subarray(0, 2048)).replace(/^﻿/, "").trimStart();
  return head.startsWith("<") && /<svg[\s>]/i.test(head) ? "image/svg+xml" : null;
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const SOF_MARKERS = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf]);

export function imageSize(bytes: Uint8Array, mime: Mime): { widthPx: number; heightPx: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (mime === "image/png") return bytes.length >= 24 ? { widthPx: view.getUint32(16), heightPx: view.getUint32(20) } : null;
  let offset = 2;
  while (offset + 9 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    if (SOF_MARKERS.has(marker)) return { heightPx: view.getUint16(offset + 5), widthPx: view.getUint16(offset + 7) };
    offset += 2 + view.getUint16(offset + 2);
  }
  return null;
}

/** The EXIF orientation (1 = upright). PDF embedding ignores it, while browsers honour it. */
export function jpegOrientation(bytes: Uint8Array): number {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    if (marker === 0xda || SOF_MARKERS.has(marker)) return 1;
    const length = view.getUint16(offset + 2);
    const isExif = marker === 0xe1 && new TextDecoder().decode(bytes.subarray(offset + 4, offset + 10)) === "Exif\0\0";
    if (isExif) {
      const tiff = offset + 10;
      const little = bytes[tiff] === 0x49;
      const ifd = tiff + view.getUint32(tiff + 4, little);
      const count = view.getUint16(ifd, little);
      for (let i = 0; i < count; i++) {
        const entry = ifd + 2 + i * 12;
        if (entry + 12 > bytes.length) return 1;
        if (view.getUint16(entry, little) === 0x0112) return view.getUint16(entry + 8, little);
      }
      return 1;
    }
    offset += 2 + length;
  }
  return 1;
}

async function canEmbed(bytes: Uint8Array, mime: Mime): Promise<boolean> {
  try {
    const doc = await PDFDocument.create();
    await (mime === "image/png" ? doc.embedPng(bytes) : doc.embedJpg(bytes));
    return true;
  } catch {
    return false;
  }
}

/** `upright` redraws a rotated JPEG; it needs a browser canvas, so the caller supplies it. */
export async function ingestImage(bytes: Uint8Array, name: string, store: ImageStore, upright?: (bytes: Uint8Array) => Promise<Uint8Array>): Promise<IngestResult> {
  const mime = sniffImage(bytes);
  if (!mime) return { kind: "error", error: "Yalnız PNG, JPG veya SVG yüklenebilir." };
  if (mime === "image/svg+xml") {
    if (bytes.length > MAX_SVG_BYTES) return { kind: "error", error: "SVG dosyası en fazla 200 KB olabilir." };
    return { kind: "svg", text: new TextDecoder().decode(bytes) };
  }
  if (bytes.length > MAX_IMAGE_BYTES) return { kind: "error", error: "Görsel dosyası en fazla 10 MB olabilir." };
  if (mime === "image/jpeg" && jpegOrientation(bytes) > 1) {
    const refused: IngestResult = { kind: "error", error: "Bu fotoğraf döndürülmüş kaydedilmiş ve düzeltilemedi; PNG olarak kaydedip deneyin." };
    if (!upright) return refused;
    try {
      return await ingestImage(await upright(bytes), name, store);
    } catch {
      return refused;
    }
  }
  const size = imageSize(bytes, mime);
  if (!size || size.widthPx === 0 || size.heightPx === 0 || !(await canEmbed(bytes, mime))) return { kind: "error", error: "Bu görsel PDF'e gömülemiyor; başka bir dosya deneyin." };
  const id = await sha256Hex(bytes);
  try {
    await store.put(id, bytes);
  } catch {
    return { kind: "error", error: "Tarayıcı depolaması kullanılamıyor; görsel kaydedilemedi." };
  }
  return { kind: "image", id, meta: { name, mime, ...size } };
}

export function createMemoryImageStore(): ImageStore {
  const data = new Map<string, Uint8Array>();
  return { put: async (id, bytes) => void data.set(id, bytes), get: async (id) => data.get(id) };
}

const DB_NAME = "labelprint";
const STORE_NAME = "images";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") return reject(new Error("IndexedDB yok"));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE_NAME);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const request = action(db.transaction(STORE_NAME, mode).objectStore(STORE_NAME));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      }),
  );
}

export function createIdbImageStore(): ImageStore {
  return {
    put: (id, bytes) => run("readwrite", (s) => s.put(bytes, id)).then(() => undefined),
    get: (id) => run<Uint8Array | undefined>("readonly", (s) => s.get(id)).catch(() => undefined),
  };
}
