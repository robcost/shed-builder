"use client";

/**
 * `ShedConfigProvider` owns the single working `ShedConfig` and exposes typed
 * mutators plus local-storage-backed design management. Consumers read it via
 * the `useShedConfig` hook. This follows the project's "dependency injection via
 * React context + custom hooks" preference — no singletons or global state.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { DEFAULTS, ELEMENTS, OPENING_PRESETS } from "@/lib/shed/constants";
import { snapToBay, validate } from "@/lib/shed/validation";
import {
  deleteDesign as storageDelete,
  listDesigns,
  loadCurrent,
  saveCurrent,
  saveDesign,
} from "@/lib/shed/storage";
import type {
  ColourElement,
  ColourName,
  Fix,
  Opening,
  OpeningType,
  SavedDesign,
  Severity,
  ShedConfig,
  ShowKey,
} from "@/types/shed";

/** Nested config keys that carry an object value (for `setIn`). */
type NestedKey = "split" | "terrain" | "fitout";

/** The value exposed by the shed config context. */
export interface ShedContextValue {
  /** The current working configuration. */
  cfg: ShedConfig;
  /** Replace the whole config. */
  setCfg: (cfg: ShedConfig) => void;
  /** Patch top-level fields. */
  set: (patch: Partial<ShedConfig>) => void;
  /** Patch a nested object field (`split` / `terrain` / `fitout`). */
  setIn: <K extends NestedKey>(key: K, patch: Partial<ShedConfig[K]>) => void;
  /** Toggle a scene overlay. */
  setShow: (k: ShowKey, v: boolean) => void;
  /** Set a single element's colour. */
  setColour: (el: ColourElement, name: ColourName) => void;
  /** Apply a colour to every element. */
  setColourAll: (name: ColourName) => void;
  /** Patch a single opening by id. */
  setOpening: (id: number, patch: Partial<Opening>) => void;
  /** Add a new opening of the given type, snapped to a bay. */
  addOpening: (type: OpeningType) => void;
  /** Remove an opening by id. */
  removeOpening: (id: number) => void;
  /** Snap an opening to the nearest bay. */
  centreOpening: (id: number) => void;
  /** Apply a single validation fix. */
  applyFix: (fix: Fix) => void;
  /** Iteratively apply fixes for the given severities until stable. */
  fixAll: (sevs: Severity[]) => void;
  /** Reset to the default configuration. */
  reset: () => void;

  /** Saved designs (most recent first). */
  designs: SavedDesign[];
  /** Id of the currently open saved design, if any. */
  currentDesignId: string | null;
  /** Name of the current design (empty if unsaved). */
  currentName: string;
  /** Save the working config under a name (updates the open design if set). */
  saveCurrentAs: (name: string) => void;
  /** Open a saved design into the working config. */
  openDesign: (id: string) => void;
  /** Delete a saved design. */
  removeDesign: (id: string) => void;
  /** Start a fresh design from defaults. */
  newDesign: () => void;
  /** Load an imported config into the working config as a new (unsaved) design. */
  importConfig: (cfg: ShedConfig) => void;
}

const ShedContext = createContext<ShedContextValue | null>(null);

/** Provider that owns the working config and design list. */
export function ShedConfigProvider({ children }: { children: React.ReactNode }) {
  const [cfg, setCfgState] = useState<ShedConfig>(DEFAULTS);
  const [designs, setDesigns] = useState<SavedDesign[]>([]);
  const [currentDesignId, setCurrentDesignId] = useState<string | null>(null);
  const [currentName, setCurrentName] = useState<string>("");
  const nextId = useRef(100);
  const hydrated = useRef(false);

  // Hydrate from local storage after mount so server and first client render
  // agree on DEFAULTS (avoids a hydration mismatch). Reading persisted state on
  // mount is the intended use of an effect, so the set-state-in-effect rule is
  // disabled here deliberately.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const saved = loadCurrent();
    if (saved) {
      setCfgState(saved);
      nextId.current = Math.max(100, ...saved.openings.map((o) => o.id + 1));
    }
    setDesigns(listDesigns());
    hydrated.current = true;
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Autosave the working config (debounced) once hydrated.
  useEffect(() => {
    if (!hydrated.current) return;
    const t = setTimeout(() => saveCurrent(cfg), 400);
    return () => clearTimeout(t);
  }, [cfg]);

  const setCfg = useCallback((c: ShedConfig) => setCfgState(c), []);
  const set = useCallback(
    (patch: Partial<ShedConfig>) => setCfgState((c) => ({ ...c, ...patch })),
    [],
  );
  const setIn = useCallback(
    <K extends NestedKey>(key: K, patch: Partial<ShedConfig[K]>) =>
      setCfgState((c) => ({ ...c, [key]: { ...c[key], ...patch } })),
    [],
  );
  const setShow = useCallback(
    (k: ShowKey, v: boolean) =>
      setCfgState((c) => ({ ...c, show: { ...c.show, [k]: v } })),
    [],
  );
  const setColour = useCallback(
    (el: ColourElement, name: ColourName) =>
      setCfgState((c) => ({ ...c, colours: { ...c.colours, [el]: name } })),
    [],
  );
  const setColourAll = useCallback(
    (name: ColourName) =>
      setCfgState((c) => ({
        ...c,
        colours: Object.fromEntries(ELEMENTS.map(([k]) => [k, name])) as ShedConfig["colours"],
      })),
    [],
  );
  const setOpening = useCallback(
    (id: number, patch: Partial<Opening>) =>
      setCfgState((c) => ({
        ...c,
        openings: c.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
      })),
    [],
  );
  const addOpening = useCallback((type: OpeningType) => {
    setCfgState((c) => {
      const o: Opening = {
        id: nextId.current++,
        wall: type === "roller" ? "right" : "front",
        type,
        ...OPENING_PRESETS[type],
        offset: 0.6,
      };
      o.offset = snapToBay(c, o);
      return { ...c, openings: [...c.openings, o] };
    });
  }, []);
  const removeOpening = useCallback(
    (id: number) =>
      setCfgState((c) => ({ ...c, openings: c.openings.filter((o) => o.id !== id) })),
    [],
  );
  const centreOpening = useCallback(
    (id: number) =>
      setCfgState((c) => ({
        ...c,
        openings: c.openings.map((o) =>
          o.id === id ? { ...o, offset: snapToBay(c, o) } : o,
        ),
      })),
    [],
  );

  const applyFix = useCallback(
    (fix: Fix) => setCfgState((c) => fix.apply(c) || c),
    [],
  );
  // Apply fixes repeatedly until they stop resolving. Each pass re-validates so a
  // fix that exposes the next problem gets picked up rather than being lost.
  const fixAll = useCallback((sevs: Severity[]) => {
    setCfgState((c) => {
      let cur = c;
      for (let pass = 0; pass < 20; pass++) {
        const next = validate(cur).find((i) => sevs.includes(i.sev) && i.fix);
        if (!next || !next.fix) break;
        const after = next.fix.apply(cur);
        if (!after || JSON.stringify(after) === JSON.stringify(cur)) break;
        cur = after;
      }
      return cur;
    });
  }, []);

  const reset = useCallback(() => {
    setCfgState(DEFAULTS);
    setCurrentDesignId(null);
    setCurrentName("");
  }, []);

  const saveCurrentAs = useCallback(
    (name: string) => {
      const rec = saveDesign(name, cfg, currentDesignId ?? undefined);
      setCurrentDesignId(rec.id);
      setCurrentName(rec.name);
      setDesigns(listDesigns());
    },
    [cfg, currentDesignId],
  );
  const openDesign = useCallback((id: string) => {
    const rec = listDesigns().find((d) => d.id === id);
    if (!rec) return;
    setCfgState(rec.cfg);
    setCurrentDesignId(rec.id);
    setCurrentName(rec.name);
    nextId.current = Math.max(100, ...rec.cfg.openings.map((o) => o.id + 1));
  }, []);
  const removeDesign = useCallback(
    (id: string) => {
      storageDelete(id);
      setDesigns(listDesigns());
      if (id === currentDesignId) {
        setCurrentDesignId(null);
        setCurrentName("");
      }
    },
    [currentDesignId],
  );
  const newDesign = useCallback(() => {
    setCfgState(DEFAULTS);
    setCurrentDesignId(null);
    setCurrentName("");
  }, []);
  const importConfig = useCallback((incoming: ShedConfig) => {
    setCfgState(incoming);
    setCurrentDesignId(null);
    setCurrentName("");
    nextId.current = Math.max(100, ...incoming.openings.map((o) => o.id + 1));
  }, []);

  const value = useMemo<ShedContextValue>(
    () => ({
      cfg, setCfg, set, setIn, setShow, setColour, setColourAll,
      setOpening, addOpening, removeOpening, centreOpening,
      applyFix, fixAll, reset,
      designs, currentDesignId, currentName,
      saveCurrentAs, openDesign, removeDesign, newDesign, importConfig,
    }),
    [
      cfg, setCfg, set, setIn, setShow, setColour, setColourAll,
      setOpening, addOpening, removeOpening, centreOpening,
      applyFix, fixAll, reset,
      designs, currentDesignId, currentName,
      saveCurrentAs, openDesign, removeDesign, newDesign, importConfig,
    ],
  );

  return <ShedContext.Provider value={value}>{children}</ShedContext.Provider>;
}

/** Access the shed config context. Must be used within a `ShedConfigProvider`. */
export function useShedConfig(): ShedContextValue {
  const ctx = useContext(ShedContext);
  if (!ctx) throw new Error("useShedConfig must be used within a ShedConfigProvider");
  return ctx;
}
