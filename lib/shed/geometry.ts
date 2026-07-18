/**
 * Levels & geometry maths — the single source of truth for slab levels, roof
 * top surface, wall profiles, terrain benching, earthworks and the fit-out
 * layout. Ported verbatim from the prototype (`shed-configurator-v2.jsx`);
 * behaviour is unchanged, only types have been added.
 *
 * Only `THREE.Vector3` / `THREE.Matrix4` maths are used here (no DOM / WebGL),
 * so this module is safe to import outside the browser.
 */
import * as THREE from "three";
import { D } from "@/lib/shed/constants";
import type { ShedConfig, Wall } from "@/types/shed";

/** A point in wall-local `(u, y)` coordinates. */
export type Pt = [number, number];

/** An orthonormal basis describing a wall's placement in world space. */
export interface Basis {
  /** World-space origin (the wall's left corner at ground level). */
  origin: THREE.Vector3;
  /** Unit direction along the wall (increasing `u`). */
  dir: THREE.Vector3;
  /** Unit outward normal of the wall. */
  out: THREE.Vector3;
  /** Wall width in metres. */
  w: number;
}

/** Top and base polylines for a wall, in wall-local `(u, y)`. */
export interface Profile {
  /** Wall width in metres. */
  w: number;
  /** Top edge polyline (underside of roof). */
  top: Pt[];
  /** Base edge polyline (slab / step). */
  base: Pt[];
}

/** `-1` if the low end is the left gable, `+1` if the right. */
export const lowSign = (cfg: ShedConfig): number =>
  cfg.split.lowEnd === "left" ? -1 : 1;

/** World-space x of the slab step, or `null` if the slab is not split. */
export const splitX = (cfg: ShedConfig): number | null =>
  cfg.split.enabled ? lowSign(cfg) * (cfg.length / 2 - cfg.split.backLen) : null;

/** The split-level drop in metres (0 when not split). */
export const dropOf = (cfg: ShedConfig): number =>
  cfg.split.enabled ? cfg.split.drop : 0;

/** Whether world-space x falls on the lower slab. */
export const isLowX = (cfg: ShedConfig, x: number): boolean =>
  cfg.split.enabled &&
  (lowSign(cfg) < 0 ? x < (splitX(cfg) as number) : x > (splitX(cfg) as number));

/** Slab top level at world-space x. */
export const slabYAt = (cfg: ShedConfig, x: number): number =>
  isLowX(cfg, x) ? -dropOf(cfg) : 0;

/** World-space x of the low gable end. */
export const lowEndX = (cfg: ShedConfig): number =>
  (lowSign(cfg) * cfg.length) / 2;

/** World-space x of the high gable end. */
export const highEndX = (cfg: ShedConfig): number =>
  (-lowSign(cfg) * cfg.length) / 2;

/** Whether a skillion roof falls along the building length (vs across the span). */
export function skillionAlongX(cfg: ShedConfig): boolean {
  return cfg.skillionLow === "left" || cfg.skillionLow === "right";
}

/** Horizontal run the skillion falls across. */
export function skillionRun(cfg: ShedConfig): number {
  return skillionAlongX(cfg) ? cfg.length : cfg.span;
}

/** Ridge / high-point height above the upper slab. */
export function ridgeHeight(cfg: ShedConfig): number {
  const t = Math.tan(D(cfg.pitch));
  return cfg.roofType === "gable"
    ? cfg.wallHeight + (cfg.span / 2) * t
    : cfg.wallHeight + skillionRun(cfg) * t;
}

/** Whether a wall is one of the long side walls. */
export const isSideWall = (w: Wall): boolean => w === "front" || w === "back";

/** Placement basis for a wall in world space. */
export function wallBasis(cfg: ShedConfig, wall: Wall): Basis {
  const { length: L, span: S } = cfg;
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  switch (wall) {
    case "front": return { origin: V(-L / 2, 0, S / 2), dir: V(1, 0, 0), out: V(0, 0, 1), w: L };
    case "back": return { origin: V(L / 2, 0, -S / 2), dir: V(-1, 0, 0), out: V(0, 0, -1), w: L };
    case "right": return { origin: V(L / 2, 0, S / 2), dir: V(0, 0, -1), out: V(1, 0, 0), w: S };
    default: return { origin: V(-L / 2, 0, -S / 2), dir: V(0, 0, 1), out: V(-1, 0, 0), w: S };
  }
}

/** World-space point at wall-local coordinate `u`. */
export const worldAtU = (cfg: ShedConfig, wall: Wall, u: number): THREE.Vector3 => {
  const b = wallBasis(cfg, wall);
  return b.origin.clone().add(b.dir.clone().multiplyScalar(u));
};

/** Wall-local `u` for a world-space x on a side wall. */
export const uOfX = (cfg: ShedConfig, wall: Wall, x: number): number =>
  wall === "front" ? x + cfg.length / 2 : cfg.length / 2 - x;

/**
 * Underside-of-roof height at any point in plan. The single source of truth for
 * every wall top edge, so the fall direction can never disagree with the walls.
 */
export function roofTopY(cfg: ShedConfig, x: number, z: number): number {
  const { span: S, length: L, wallHeight: H } = cfg;
  const t = Math.tan(D(cfg.pitch));
  if (cfg.roofType === "gable") return H + (S / 2 - Math.abs(z)) * t;
  switch (cfg.skillionLow) {
    case "front": return H + (S / 2 - z) * t;
    case "back": return H + (S / 2 + z) * t;
    case "right": return H + (L / 2 - x) * t;
    default: return H + (L / 2 + x) * t; // "left"
  }
}

/** Top and base polylines for a wall, in wall-local `(u, y)`. */
export function profileFor(cfg: ShedConfig, wall: Wall): Profile {
  const { span: S, length: L } = cfg;
  const w = isSideWall(wall) ? L : S;
  const at = (u: number): Pt => {
    const p = worldAtU(cfg, wall, u);
    return [u, roofTopY(cfg, p.x, p.z)];
  };
  // gable ends need the ridge vertex; every other case is linear in u
  const top: Pt[] = cfg.roofType === "gable" && !isSideWall(wall)
    ? [at(0), at(w / 2), at(w)]
    : [at(0), at(w)];

  let base: Pt[];
  if (!cfg.split.enabled) base = [[0, 0], [w, 0]];
  else if (isSideWall(wall)) {
    const us = uOfX(cfg, wall, splitX(cfg) as number);
    const y0 = slabYAt(cfg, worldAtU(cfg, wall, 0).x);
    const y1 = slabYAt(cfg, worldAtU(cfg, wall, w).x);
    base = [[0, y0], [us, y0], [us, y1], [w, y1]];
  } else {
    const y = slabYAt(cfg, wall === "left" ? -L / 2 : L / 2);
    base = [[0, y], [w, y]];
  }
  return { w, top, base };
}

/** Linearly sample a polyline at `u`, clamped to its ends. */
export function sample(pts: ReadonlyArray<Pt>, u: number): number {
  const x = Math.max(pts[0][0], Math.min(pts[pts.length - 1][0], u));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (b[0] - a[0] <= 1e-9) continue;
    if (x >= a[0] && x <= b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return pts[pts.length - 1][1];
}

/** Roof underside height at wall-local `u`. */
export const topAt = (prof: Profile, u: number): number => sample(prof.top, u);

/** Base (slab / step) height at wall-local `u`. */
export const baseAt = (prof: Profile, u: number): number => sample(prof.base, u);

/**
 * Internal height of the lower section: lowest and highest point of the roof
 * over the low end wall, measured from the lower slab. Works whichever way the
 * roof falls.
 */
export function backInternal(cfg: ShedConfig): { lo: number; hi: number } {
  const prof = profileFor(cfg, cfg.split.lowEnd);
  const ys = prof.top.map((p) => p[1]);
  const d = dropOf(cfg);
  return { lo: Math.min(...ys) + d, hi: Math.max(...ys) + d };
}

/** Bay spacing along the length, in metres. */
export const bayOf = (c: ShedConfig): number => c.length / c.bays;

/** Number of end posts across the span. */
export const endPostsOf = (c: ShedConfig): number => Math.max(1, Math.round(c.span / 3));

/** End-post spacing across the span, in metres. */
export const endSpacingOf = (c: ShedConfig): number => c.span / endPostsOf(c);

/** Column / post spacing for a given wall. */
export const spacingFor = (c: ShedConfig, w: Wall): number =>
  isSideWall(w) ? bayOf(c) : endSpacingOf(c);

/* ---- terrain -------------------------------------------------------------- */

/**
 * Natural ground level (RL, m) at a plan point, bilinearly interpolated from the
 * terrain spot-level grid. The grid is pinned to the shed footprint (col 0 =
 * left/−x, last col = right/+x; row 0 = front/+z, last row = back/−z) and
 * clamped to the nearest edge outside the footprint.
 */
export function naturalY(cfg: ShedConfig, x: number, z: number): number {
  const { rows, cols, levels } = cfg.terrain;
  const { length: L, span: S } = cfg;
  if (!levels || rows < 1 || cols < 1 || levels.length < rows * cols) return 0;
  const fx = Math.max(0, Math.min(1, (x + L / 2) / L)); // 0 = left, 1 = right
  const fz = Math.max(0, Math.min(1, (S / 2 - z) / S)); // 0 = front, 1 = back
  const cf = cols > 1 ? fx * (cols - 1) : 0;
  const rf = rows > 1 ? fz * (rows - 1) : 0;
  const c0 = Math.floor(cf), r0 = Math.floor(rf);
  const c1 = Math.min(c0 + 1, cols - 1), r1 = Math.min(r0 + 1, rows - 1);
  const tc = cf - c0, tr = rf - r0;
  const at = (r: number, c: number) => levels[r * cols + c];
  const top = at(r0, c0) * (1 - tc) + at(r0, c1) * tc;
  const bot = at(r1, c0) * (1 - tc) + at(r1, c1) * tc;
  return top * (1 - tr) + bot * tr;
}

/** World-space `(x, z)` of terrain grid node `(r, c)` on the footprint. */
export function terrainNodePos(cfg: ShedConfig, r: number, c: number): { x: number; z: number } {
  const { rows, cols } = cfg.terrain;
  const { length: L, span: S } = cfg;
  const fx = cols > 1 ? c / (cols - 1) : 0.5;
  const fz = rows > 1 ? r / (rows - 1) : 0.5;
  return { x: -L / 2 + fx * L, z: S / 2 - fz * S };
}

/**
 * Resample the current natural surface onto a new grid resolution, so changing
 * the number of rows/cols preserves the shape rather than resetting it.
 */
export function resampleTerrainLevels(cfg: ShedConfig, rows: number, cols: number): number[] {
  const { length: L, span: S } = cfg;
  const out: number[] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const fx = cols > 1 ? c / (cols - 1) : 0.5;
      const fz = rows > 1 ? r / (rows - 1) : 0.5;
      out.push(+naturalY(cfg, -L / 2 + fx * L, S / 2 - fz * S).toFixed(3));
    }
  return out;
}

/** Sub-grade level below a slab at world-space x. */
export function padSubgrade(cfg: ShedConfig, x: number): number {
  return slabYAt(cfg, x) - 0.15;
}

/** Finished surface: benched pad inside the footprint+margin, battered out to natural. */
export function terrainY(cfg: ShedConfig, x: number, z: number): number {
  const m = cfg.terrain.margin;
  const x0 = -cfg.length / 2 - m, x1 = cfg.length / 2 + m;
  const z0 = -cfg.span / 2 - m, z1 = cfg.span / 2 + m;
  const cx = Math.max(x0, Math.min(x1, x));
  const cz = Math.max(z0, Math.min(z1, z));
  const P = padSubgrade(cfg, cx);
  const d = Math.hypot(x - cx, z - cz);
  if (d < 1e-6) return P;
  const nat = naturalY(cfg, x, z);
  return nat > P
    ? Math.min(nat, P + d / cfg.terrain.cutBatter)
    : Math.max(nat, P - d / cfg.terrain.fillBatter);
}

/** Approximate bulk earthworks by sampling the finished vs natural surface. */
export function earthworks(cfg: ShedConfig): {
  cut: number;
  fill: number;
  maxCut: number;
  maxFill: number;
} {
  const step = 0.4;
  const R = Math.max(cfg.length, cfg.span) / 2 + 22;
  const cell = step * step;
  let cut = 0, fill = 0, maxCut = 0, maxFill = 0;
  for (let x = -R; x <= R; x += step)
    for (let z = -R; z <= R; z += step) {
      const d = naturalY(cfg, x, z) - terrainY(cfg, x, z);
      if (d > 0) { cut += d * cell; maxCut = Math.max(maxCut, d); }
      else { fill += -d * cell; maxFill = Math.max(maxFill, -d); }
    }
  return { cut, fill, maxCut, maxFill };
}

/** Retained height along each wall, sampled. */
export function retainStats(cfg: ShedConfig): {
  max: number;
  walls: Record<string, number>;
} {
  if (!cfg.split.enabled) return { max: 0, walls: {} };
  const out: { max: number; walls: Record<string, number> } = { max: 0, walls: {} };
  (["front", "back", "left", "right"] as const).forEach((w) => {
    const prof = profileFor(cfg, w);
    let mx = 0;
    for (let u = 0; u <= prof.w; u += 0.1) {
      const p = worldAtU(cfg, w, u);
      const h = naturalY(cfg, p.x, p.z) - baseAt(prof, u);
      if (h > mx) mx = h;
    }
    out.walls[w] = mx;
    out.max = Math.max(out.max, mx);
  });
  return out;
}

/* ---- fit-out layout ------------------------------------------------------- */

/** Computed layout metrics for the lower-level fit-out, or `null` if disabled. */
export interface FitoutPlan {
  s: number;
  sx: number;
  ex: number;
  gymEnd: number;
  bathZ: number;
  bathZi: number;
  bathXi: number;
  base: number;
  top: number;
  S: number;
}

/** Derive the fit-out layout, or `null` if the split slab / fit-out is off. */
export function fitoutPlan(cfg: ShedConfig): FitoutPlan | null {
  if (!cfg.split.enabled || !cfg.fitout.enabled) return null;
  const s = lowSign(cfg);
  const sx = splitX(cfg) as number;
  const ex = lowEndX(cfg);
  const S = cfg.span;
  const f = cfg.fitout;
  const gymEnd = sx + s * f.gymLen;                      // gym | flat divider
  const bathZ = f.bath.side === "front" ? S / 2 : -S / 2;
  const bathZi = f.bath.side === "front" ? S / 2 - f.bath.width : -S / 2 + f.bath.width;
  const bathXi = ex - s * f.bath.depth;                   // inner face of bathroom
  const base = -dropOf(cfg);
  const top = base + f.ceiling;
  return { s, sx, ex, gymEnd, bathZ, bathZi, bathXi, base, top, S };
}
