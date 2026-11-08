import { useSyncExternalStore } from "react";
import { gridZones, pruneDesigns, resolveCellDesign } from "../core/cells";
import {
  newProject,
  parseProject,
  serialize,
  type DesignElement,
  type FrameOptions,
  type GridZone,
  type ImageMeta,
  type LabelDesign,
  type LabelProject,
  type TextElement,
} from "../core/document";
import type { Rect } from "../core/geometry";
import { applyListFill, type ListFillOptions } from "../core/listFill";
import { safeRead, safeWrite, type StorageLike } from "../core/storage";
import type { Template } from "../core/templates";
import { applyPattern as buildPattern } from "../library/textPatterns";

export const PROJECT_KEY = "labelprint.project.v2";
export const LEGACY_PROJECT_KEY = "labelprint.project.v1";
const HISTORY_LIMIT = 50;
const SAMPLE_TEXTS = ["Başlık", "Alt başlık", "Bilgi"];

export type Active = { zone: number } | null;
export type Scope = { kind: "all" } | { kind: "cell"; cell: number };
export type AppState = {
  project: LabelProject;
  pageIndex: number;
  scope: Scope;
  selectedElementId: string | null;
  active: Active;
  guides: boolean;
  saveFailed: boolean;
  canUndo: boolean;
  canRedo: boolean;
};

type PageRef = Pick<AppState, "project" | "pageIndex">;

export const currentPage = (state: PageRef) => state.project.pages[state.pageIndex];
export const currentGrid = (state: PageRef) => currentPage(state).zones.find((z): z is GridZone => z.kind === "grid");

/** The design that edits apply to: a free zone's, a detached cell's, or the shared one. */
export function activeDesign(state: AppState): LabelDesign {
  if (state.active) {
    const zone = currentPage(state).zones[state.active.zone];
    if (zone?.kind === "free") return zone.design;
  }
  const grid = currentGrid(state);
  const own = grid && state.scope.kind === "cell" ? grid.content[state.scope.cell]?.designId : undefined;
  return state.project.designs[own ?? grid?.designId ?? "d1"] ?? { elements: [] };
}

/** What the editor draws: the active design with the selected cell's values applied. */
export function editingDesign(state: AppState): LabelDesign {
  const grid = currentGrid(state);
  if (state.active || !grid || state.scope.kind !== "cell") return activeDesign(state);
  return resolveCellDesign(grid, state.scope.cell, state.project.designs) ?? activeDesign(state);
}

/** How many cells with content a template of this capacity could not hold. */
export function cellsLostBy(project: LabelProject, capacity: number): number {
  return gridZones(project).reduce((n, z) => n + Object.keys(z.content).filter((k) => Number(k) >= capacity).length, 0);
}

/** True for a cell that follows the shared design: only its text and picture may change. */
export function isCellLocked(state: AppState): boolean {
  return state.scope.kind === "cell" && !state.active && !currentGrid(state)?.content[state.scope.cell]?.designId;
}

function patternMapping(before: DesignElement[], after: DesignElement[]): Map<string, string> {
  const mapping = new Map<string, string>();
  for (const kind of ["text", "symbol"] as const) {
    const next = after.filter((e) => e.kind === kind);
    before.filter((e) => e.kind === kind).forEach((e, i) => next[i] && mapping.set(e.id, next[i].id));
  }
  return mapping;
}

function rebuildPattern(patternId: string, label: { width: number; height: number }, before: DesignElement[]): DesignElement[] {
  const texts = before.filter((e): e is TextElement => e.kind === "text").map((e) => e.text);
  const symbol = before.find((e) => e.kind === "symbol");
  return buildPattern(patternId, label, texts.length ? texts : SAMPLE_TEXTS, symbol?.kind === "symbol" ? symbol.symbolId : undefined);
}

/** A pattern rebuilds the elements with new ids; cell values follow them by kind and order. */
function remapValues(project: LabelProject, design: LabelDesign, before: DesignElement[]) {
  const mapping = patternMapping(before, design.elements);
  for (const zone of gridZones(project)) {
    for (const entry of Object.values(zone.content)) {
      if (project.designs[entry.designId ?? zone.designId] !== design) continue;
      entry.values = Object.fromEntries(Object.entries(entry.values).flatMap(([id, value]) => (mapping.has(id) ? [[mapping.get(id)!, value]] : [])));
    }
  }
}

export type Store = ReturnType<typeof createStore>;

export function createStore(defaultTemplate: Template, storage: StorageLike) {
  const saved = safeRead(storage, PROJECT_KEY) ?? safeRead(storage, LEGACY_PROJECT_KEY);
  const restored = saved ? parseProject(saved) : null;
  let state: AppState = {
    project: restored?.ok ? restored.project : newProject(defaultTemplate),
    pageIndex: 0,
    scope: { kind: "all" },
    selectedElementId: null,
    active: null,
    guides: false,
    saveFailed: false,
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
    const saved = safeWrite(storage, PROJECT_KEY, serialize(project));
    set({ project, saveFailed: !saved, ...patch });
  }

  function restore(project: LabelProject) {
    lastMergeKey = null;
    const saved = safeWrite(storage, PROJECT_KEY, serialize(project));
    const pageIndex = Math.min(state.pageIndex, project.pages.length - 1);
    set({ project, saveFailed: !saved, pageIndex, scope: pageIndex === state.pageIndex ? state.scope : { kind: "all" }, selectedElementId: null, active: null });
  }

  const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${nextId++}`;
  const gridOf = (project: LabelProject) => currentGrid({ project, pageIndex: state.pageIndex });
  const leaveCell = { scope: { kind: "all" } as Scope, active: null, selectedElementId: null };

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
    addImage(id: string, meta: ImageMeta): boolean {
      commit((project) => void (project.images[id] = meta));
      return this.pickSymbol(`upload:${id}`);
    },
    /** From the library: replaces the selected cell's picture when there is one to replace, otherwise adds a new element. */
    pickSymbol(symbolId: string): boolean {
      const target = activeDesign(state).elements.find((e) => e.kind === "symbol" && (!state.selectedElementId || e.id === state.selectedElementId)) ?? activeDesign(state).elements.find((e) => e.kind === "symbol");
      if (state.scope.kind === "cell" && !state.active && target) this.setCellValue(state.scope.cell, target.id, symbolId);
      else if (isCellLocked(state)) return false;
      else this.addSymbol(symbolId);
      return true;
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
      if (isCellLocked(state)) return;
      commit(
        (project, design) => {
          const before = design.elements;
          design.elements = rebuildPattern(patternId, label, before);
          remapValues(project, design, before);
        },
        { selectedElementId: null },
      );
    },
    /** How many filled-in cell values a pattern has no place for. */
    patternLoss(patternId: string, label: { width: number; height: number }): number {
      const design = activeDesign(state);
      const mapping = patternMapping(design.elements, rebuildPattern(patternId, label, design.elements));
      const ids = new Set(design.elements.map((e) => e.id));
      return gridZones(state.project)
        .flatMap((zone) => Object.values(zone.content).filter((entry) => state.project.designs[entry.designId ?? zone.designId] === design))
        .flatMap((entry) => Object.entries(entry.values))
        .filter(([id, value]) => value !== "" && ids.has(id) && !mapping.has(id)).length;
    },
    setFrame(frameId: string | undefined, frameOptions?: FrameOptions) {
      if (isCellLocked(state)) return;
      commit((_, design) => {
        design.frameId = frameId;
        design.frameOptions = frameOptions;
      });
    },
    setTemplate(template: Template) {
      const capacity = template.grid.columns * template.grid.rows;
      commit((project) => {
        const used = Array.from({ length: capacity }, (_, i) => i);
        const orphaned: string[] = [];
        const shared = gridZones(project)[0]?.designId ?? "d1";
        for (const page of project.pages) {
          page.sheet = { ...template.sheet };
          const zone = page.zones.find((z): z is GridZone => z.kind === "grid");
          if (!zone) {
            page.zones.unshift({ kind: "grid", templateId: template.id, cells: { used: [...used] }, designId: shared, content: {} });
            continue;
          }
          Object.assign(zone, { templateId: template.id, cells: { used: [...used] } });
          for (const key of Object.keys(zone.content).map(Number).filter((k) => k >= capacity)) {
            const designId = zone.content[key].designId;
            if (designId) orphaned.push(designId);
            delete zone.content[key];
          }
        }
        project.designs[shared] ??= { elements: [] };
        pruneDesigns(project, orphaned);
      }, leaveCell);
    },
    setCells(used: number[]) {
      commit((project) => {
        const zone = gridOf(project);
        if (!zone) return;
        zone.cells.used = used;
        delete zone.listBase;
      });
    },
    setPage(pageIndex: number) {
      if (pageIndex < 0 || pageIndex >= state.project.pages.length) return;
      lastMergeKey = null;
      set({ pageIndex, ...leaveCell });
    },
    addPage(capacity: number) {
      commit(
        (project) => {
          const page = project.pages[state.pageIndex];
          const grid = gridOf(project);
          const used = Array.from({ length: capacity }, (_, i) => i);
          project.pages.push({ sheet: { ...page.sheet }, zones: grid ? [{ kind: "grid", templateId: grid.templateId, cells: { used }, designId: grid.designId, content: {} }] : [] });
        },
        { pageIndex: state.project.pages.length, ...leaveCell },
      );
    },
    removePage(index: number) {
      if (state.project.pages.length <= 1) return;
      const pageIndex = Math.min(index < state.pageIndex ? state.pageIndex - 1 : state.pageIndex, state.project.pages.length - 2);
      commit(
        (project) => {
          const [removed] = project.pages.splice(index, 1);
          pruneDesigns(project, removed.zones.flatMap((z) => (z.kind === "grid" ? [z.designId, ...Object.values(z.content).flatMap((e) => e.designId ?? [])] : [])));
        },
        { pageIndex, ...leaveCell },
      );
    },
    setScope(scope: Scope) {
      lastMergeKey = null;
      set({ scope, active: null, selectedElementId: null });
    },
    setCellValue(cell: number, elementId: string, value: string) {
      commit(
        (project) => {
          const zone = gridOf(project);
          if (zone) (zone.content[cell] ??= { values: {} }).values[elementId] = value;
        },
        {},
        `cell:${state.pageIndex}:${cell}:${elementId}`,
      );
    },
    clearCellValue(cell: number, elementId: string) {
      commit((project) => {
        const zone = gridOf(project);
        const entry = zone?.content[cell];
        if (!zone || !entry) return;
        delete entry.values[elementId];
        if (!entry.designId && Object.keys(entry.values).length === 0) delete zone.content[cell];
      });
    },
    detachCell(cell: number) {
      const designId = newId("d");
      commit((project) => {
        const zone = gridOf(project);
        if (!zone || zone.content[cell]?.designId) return;
        const entry = (zone.content[cell] ??= { values: {} });
        const copy: LabelDesign = structuredClone(project.designs[zone.designId]);
        copy.elements = copy.elements.map((e) => {
          const value = entry.values[e.id];
          if (!value) return e;
          return e.kind === "text" ? { ...e, text: value } : { ...e, symbolId: value };
        });
        project.designs[designId] = copy;
        entry.designId = designId;
      });
    },
    reattachCell(cell: number) {
      commit((project) => {
        const zone = gridOf(project);
        const entry = zone?.content[cell];
        if (!zone || !entry?.designId) return;
        const designId = entry.designId;
        const shared = new Set(project.designs[zone.designId].elements.map((e) => e.id));
        entry.values = Object.fromEntries(Object.entries(entry.values).filter(([id]) => shared.has(id)));
        delete entry.designId;
        if (Object.keys(entry.values).length === 0) delete zone.content[cell];
        pruneDesigns(project, [designId]);
      });
    },
    fillFromList(lines: string[], options: Omit<ListFillOptions, "newId">) {
      const result = applyListFill(state.project, state.pageIndex, lines, { ...options, newId: () => newId("t") });
      commit((project) => void Object.assign(project, result.project), { pageIndex: result.pageIndex, ...leaveCell });
      return result.report;
    },
    setOffset(printOffset: { x: number; y: number }) {
      commit((project) => void (project.printOffset = printOffset), {}, "offset");
    },
    setGuides(guides: boolean) {
      set({ guides });
    },
    setActive(active: Active) {
      lastMergeKey = null;
      set({ active, selectedElementId: null, scope: { kind: "all" } });
    },
    addFreeZone(rect: Rect) {
      commit((project) => void project.pages[state.pageIndex].zones.push({ kind: "free", ...rect, design: { elements: [] } }));
    },
    removeZone(index: number) {
      commit((project) => void project.pages[state.pageIndex].zones.splice(index, 1), { active: null, selectedElementId: null });
    },
    load(project: LabelProject) {
      past = [...past.slice(-HISTORY_LIMIT + 1), state.project];
      future = [];
      restore(project);
      set({ pageIndex: 0, scope: { kind: "all" } });
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
