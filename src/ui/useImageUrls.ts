import { useCallback, useEffect, useRef, useState } from "react";
import type { LabelProject } from "../core/document";
import type { ImageStore } from "../core/imageStore";

/** Turns stored image bytes into object URLs for the preview, loading each image once. */
export function useImageUrls(images: LabelProject["images"], store: ImageStore): (id: string) => string | undefined {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const requested = useRef(new Set<string>());

  useEffect(() => {
    for (const [id, meta] of Object.entries(images)) {
      if (requested.current.has(id)) continue;
      requested.current.add(id);
      void store.get(id).then((bytes) => {
        if (bytes) setUrls((current) => ({ ...current, [id]: URL.createObjectURL(new Blob([bytes as BlobPart], { type: meta.mime })) }));
        else requested.current.delete(id);
      });
    }
  }, [images, store]);

  return useCallback((id: string) => urls[id], [urls]);
}
