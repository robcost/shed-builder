/**
 * Local persistence for shed designs. Autosaves the working config and keeps a
 * list of named designs in `localStorage`, plus JSON import/export helpers.
 * All functions are browser-only and no-op / return defaults when `window` is
 * unavailable (e.g. during server render).
 */
import { DEFAULTS } from "@/lib/shed/constants";
import type { SavedDesign, ShedConfig } from "@/types/shed";

const CURRENT_KEY = "shed:current";
const DESIGNS_KEY = "shed:designs";

const hasWindow = (): boolean => typeof window !== "undefined";

/** Generate a short unique id for a saved design. */
export function genId(): string {
  return `d_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Load the autosaved working config, or `null` if none / unreadable. Runs the
 *  same normalization as import so older saved shapes (e.g. pre-grid terrain)
 *  are migrated forward. */
export function loadCurrent(): ShedConfig | null {
  if (!hasWindow()) return null;
  try {
    const raw = window.localStorage.getItem(CURRENT_KEY);
    return raw ? parseConfig(raw) : null;
  } catch {
    return null;
  }
}

/** Autosave the working config. */
export function saveCurrent(cfg: ShedConfig): void {
  if (!hasWindow()) return;
  try {
    window.localStorage.setItem(CURRENT_KEY, JSON.stringify(cfg));
  } catch {
    /* quota or serialization failure — ignore, autosave is best-effort */
  }
}

/** List saved designs, most-recently-updated first. */
export function listDesigns(): SavedDesign[] {
  if (!hasWindow()) return [];
  try {
    const raw = window.localStorage.getItem(DESIGNS_KEY);
    const arr = raw ? (JSON.parse(raw) as SavedDesign[]) : [];
    return arr.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  } catch {
    return [];
  }
}

function writeDesigns(list: SavedDesign[]): void {
  if (!hasWindow()) return;
  window.localStorage.setItem(DESIGNS_KEY, JSON.stringify(list));
}

/**
 * Save a design under a name. If `id` is given and exists it is updated,
 * otherwise a new design is created. Returns the saved record.
 */
export function saveDesign(name: string, cfg: ShedConfig, id?: string): SavedDesign {
  const list = listDesigns();
  const now = new Date().toISOString();
  const existing = id ? list.find((d) => d.id === id) : undefined;
  const record: SavedDesign = existing
    ? { ...existing, name, cfg, updatedAt: now }
    : { id: genId(), name, cfg, updatedAt: now };
  const next = existing
    ? list.map((d) => (d.id === record.id ? record : d))
    : [record, ...list];
  writeDesigns(next);
  return record;
}

/** Delete a saved design by id. */
export function deleteDesign(id: string): void {
  writeDesigns(listDesigns().filter((d) => d.id !== id));
}

/** Trigger a browser download of the config as JSON. */
export function exportConfigFile(cfg: ShedConfig, filename = "shed-config.json"): void {
  if (!hasWindow()) return;
  const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * Parse a JSON string into a `ShedConfig`, filling any missing top-level keys
 * from `DEFAULTS` so an older/partial export still loads. Throws on invalid JSON.
 */
export function parseConfig(json: string): ShedConfig {
  const parsed = JSON.parse(json) as Partial<ShedConfig>;
  const dt = DEFAULTS.terrain;
  const t = parsed.terrain as Partial<ShedConfig["terrain"]> | undefined;
  const rows = typeof t?.rows === "number" ? t.rows : dt.rows;
  const cols = typeof t?.cols === "number" ? t.cols : dt.cols;
  // Only trust the saved grid if its level count matches its declared size,
  // otherwise fall back to the default grid (e.g. pre-grid configs).
  const validGrid = Array.isArray(t?.levels) && t.levels.length === rows * cols;
  const terrain: ShedConfig["terrain"] = {
    rows: validGrid ? rows : dt.rows,
    cols: validGrid ? cols : dt.cols,
    levels: validGrid ? (t!.levels as number[]) : dt.levels,
    margin: t?.margin ?? dt.margin,
    cutBatter: t?.cutBatter ?? dt.cutBatter,
    fillBatter: t?.fillBatter ?? dt.fillBatter,
  };
  return {
    ...DEFAULTS,
    ...parsed,
    split: { ...DEFAULTS.split, ...parsed.split },
    terrain,
    fitout: {
      ...DEFAULTS.fitout,
      ...parsed.fitout,
      bath: { ...DEFAULTS.fitout.bath, ...parsed.fitout?.bath },
      stairs: { ...DEFAULTS.fitout.stairs, ...parsed.fitout?.stairs },
    },
    colours: { ...DEFAULTS.colours, ...parsed.colours },
    show: { ...DEFAULTS.show, ...parsed.show },
    openings: parsed.openings ?? DEFAULTS.openings,
    awnings: parsed.awnings ?? DEFAULTS.awnings,
  };
}
