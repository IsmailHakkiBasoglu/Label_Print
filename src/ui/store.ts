import { useSyncExternalStore } from "react";
import {
  newProject,
  parseProject,
  serialize,
  type DesignElement,
  type FrameOptions,
  type LabelDesign,
  type LabelProject,
  type TextElement,
} from "../core/document";
import type { Rect } from "../core/geometry";
import { safeRead, safeWrite, type StorageLike } from "../core/storage";
import type { Template } from "../core/templates";
import { applyPattern as buildPattern } from "../library/textPatterns";

export const PROJECT_KEY = "labelprint.project.v1";
const HISTORY_LIMIT = 50;
const SAMPLE_TEXTS = ["Başlık", "Alt başlık", "Bilgi"];

export type Active = { zone: number } | null;
export type AppState = {
  project: LabelProject;
  selectedElementId: string | null;
  active: Active;
  guides: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

export function activeDesign(state: AppState): LabelDesign {
  if (state.active) {
    const zone = state.project.pages[0].zones[state.active.zone];
    if (zone?.kind === "free") return zone.design;
  }
  const grid = state.project.pages[0].zones.find((z) => z.kind === "grid");
  return state.project.designs[grid?.kind === "grid" ? grid.designIds[0] : "d1"] ?? { elements: [] };
}

export type Store = ReturnType<typeof createStore>;

export function createStore(defaultTemplate: Template, storage: StorageLike) {
  const saved = safeRead(storage, PROJECT_KEY);
  const restored = saved ? parseProject(saved) : null;
  let state: AppState = {
    project: restored?.ok ? restored.project : newProject(defaultTemplate),
    selectedElementId: null,
    active: null,
    guides: false,
    canUndo: false,
    canRedo: false,
  };
  let past: LabelProject[] = [];
  let future: LabelProject[] = [];
  let lastMergeKey: string | null = null;
  let nextId = 1;
  const listeners = new Set<() => void>();

  const emit = () => listeners.forEach((l) => l());
  const set = (patch: Partial<AppState>) => {
    state = { ...state, ...patch, canUndo: past.length > 0, canRedo: future.length > 0 };
    emit();
  };

  function commit(change: (project: LabelProject, design: LabelDesign) => void, patch: Partial<AppState> = {}, mergeKey?: string) {
    const project = structuredClone(state.project);
    const draft: AppState = { ...state, project };
    change(project, activeDesign(draft));
    if (!mergeKey || mergeKey !== lastMergeKey) {
      past = [...past.slice(-HISTORY_LIMIT + 1), state.project];
      future = [];
    }
    lastMergeKey = mergeKey ?? null;
    safeWrite(storage, PROJECT_KEY, serialize(project));
    set({ project, ...patch });
  }

  function restore(project: LabelProject) {
    lastMergeKey = null;
    safeWrite(storage, PROJECT_KEY, serialize(project));
    set({ project, selectedElementId: null, active: null });
  }

  const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${nextId++}`;

  return {
    getState: () => state,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },

    addText() {
      const id = newId("t");
      const element: TextElement = { kind: "text", id, x: 2, y: 2, width: 30, height: 10, text: "Yazı", fontId: "sans", sizePt: 12, align: "left", color: "#000000" };
      commit((_, design) => design.elements.push(element), { selectedElementId: id });
    },
    addSymbol(symbolId: string) {
      const id = newId("s");
      commit((_, design) => design.elements.push({ kind: "symbol", id, x: 2, y: 2, width: 12, height: 12, symbolId, color: "#000000" }), { selectedElementId: id });
    },
    updateElement(id: string, patch: Partial<DesignElement>) {
      commit(
        (_, design) => {
          const el = design.elements.find((e) => e.id === id);
          if (el) Object.assign(el, patch);
        },
        {},
        `${id}:${Object.keys(patch).sort().join()}`,
      );
    },
    removeElement(id: string) {
      commit((_, design) => void (design.elements = design.elements.filter((e) => e.id !== id)), { selectedElementId: null });
    },
    select(id: string | null) {
      lastMergeKey = null;
      set({ selectedElementId: id });
    },
    applyPattern(patternId: string, label: { width: number; height: number }) {
      commit(
        (_, design) => {
          const texts = design.elements.filter((e): e is TextElement => e.kind === "text").map((e) => e.text);
          const symbol = design.elements.find((e) => e.kind === "symbol");
          design.elements = buildPattern(patternId, label, texts.length ? texts : SAMPLE_TEXTS, symbol?.kind === "symbol" ? symbol.symbolId : undefined);
        },
        { selectedElementId: null },
      );
    },
    setFrame(frameId: string | undefined, frameOptions?: FrameOptions) {
      commit((_, design) => {
        design.frameId = frameId;
        design.frameOptions = frameOptions;
      });
    },
    setTemplate(template: Template) {
      commit(
        (project) => {
          const page = project.pages[0];
          page.sheet = { ...template.sheet };
          const used = Array.from({ length: template.grid.columns * template.grid.rows }, (_, i) => i);
          const index = page.zones.findIndex((z) => z.kind === "grid");
          if (index >= 0) {
            const zone = page.zones[index];
            if (zone.kind === "grid") Object.assign(zone, { templateId: template.id, cells: { used } });
          } else {
            page.zones.unshift({ kind: "grid", templateId: template.id, cells: { used }, designIds: ["d1"] });
            project.designs.d1 ??= { elements: [] };
          }
        },
        { active: null, selectedElementId: null },
      );
    },
    setCells(used: number[]) {
      commit((project) => {
        const zone = project.pages[0].zones.find((z) => z.kind === "grid");
        if (zone?.kind === "grid") zone.cells.used = used;
      });
    },
    setOffset(printOffset: { x: number; y: number }) {
      commit((project) => void (project.printOffset = printOffset), {}, "offset");
    },
    setGuides(guides: boolean) {
      set({ guides });
    },
    setActive(active: Active) {
      lastMergeKey = null;
      set({ active, selectedElementId: null });
    },
    addFreeZone(rect: Rect) {
      commit((project) => void project.pages[0].zones.push({ kind: "free", ...rect, design: { elements: [] } }));
    },
    removeZone(index: number) {
      commit((project) => void project.pages[0].zones.splice(index, 1), { active: null, selectedElementId: null });
    },
    load(project: LabelProject) {
      past = [...past.slice(-HISTORY_LIMIT + 1), state.project];
      future = [];
      restore(project);
    },
    undo() {
      const previous = past.at(-1);
      if (!previous) return;
      past = past.slice(0, -1);
      future = [state.project, ...future];
      restore(previous);
    },
    redo() {
      const next = future[0];
      if (!next) return;
      future = future.slice(1);
      past = [...past, state.project];
      restore(next);
    },
  };
}

export function useAppState(store: Store): AppState {
  return useSyncExternalStore(store.subscribe, store.getState);
}
