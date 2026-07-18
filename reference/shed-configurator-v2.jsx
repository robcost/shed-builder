import React, { useRef, useEffect, useState, useMemo } from "react";
import * as THREE from "three";

/* ============================================================================
   Colorbond-range approximations. Screen hexes only, not colour-matched.
============================================================================ */
const PALETTE = [
  { n: "Surfmist", h: "#e4e2d5" }, { n: "Dover White", h: "#efede3" },
  { n: "Classic Cream", h: "#e9dfc0" }, { n: "Paperbark", h: "#cabfa4" },
  { n: "Evening Haze", h: "#c7c4a8" }, { n: "Shale Grey", h: "#c3c6c4" },
  { n: "Dune", h: "#b7b3a9" }, { n: "Cove", h: "#a29f94" },
  { n: "Windspray", h: "#97a0a3" }, { n: "Wallaby", h: "#8c8880" },
  { n: "Headland", h: "#8d8072" }, { n: "Bluegum", h: "#7a868b" },
  { n: "Gully", h: "#7a7768" }, { n: "Pale Eucalypt", h: "#7c846a" },
  { n: "Bushland", h: "#7a7462" }, { n: "Terrain", h: "#6a5f52" },
  { n: "Jasper", h: "#6c5d53" }, { n: "Basalt", h: "#6d6c6e" },
  { n: "Mangrove", h: "#55584e" }, { n: "Woodland Grey", h: "#4f5350" },
  { n: "Ironstone", h: "#3e434c" }, { n: "Deep Ocean", h: "#364152" },
  { n: "Cottage Green", h: "#2f4e3e" }, { n: "Manor Red", h: "#5e2028" },
  { n: "Monument", h: "#323233" }, { n: "Night Sky", h: "#101112" },
];
const hexOf = (n) => (PALETTE.find((p) => p.n === n) || PALETTE[24]).h;

const ELEMENTS = [
  ["walls", "Walls (external)"], ["roof", "Roof"], ["rollerDoors", "Roller doors"],
  ["gutter", "Gutter & fascia"], ["barge", "Gable end capping"], ["corner", "Corner flashing"],
  ["windows", "Window frames"], ["paDoors", "PA doors"],
];
const WALLS = [
  ["front", "Front side wall"], ["back", "Back side wall"],
  ["left", "Left end"], ["right", "Right end"],
];
const TYPE_LABEL = { roller: "Roller door", pa: "PA door", window: "Window" };
const OPENING_PRESETS = {
  roller: { width: 3.0, height: 2.7, sill: 0 },
  pa: { width: 0.82, height: 2.04, sill: 0 },
  window: { width: 1.8, height: 1.2, sill: 1.0 },
};
const D = (d) => (d * Math.PI) / 180;
const COL_HALF = 0.09;

const DEFAULTS = {
  span: 7, length: 14, wallHeight: 3.0, pitch: 11, roofType: "gable", skillionLow: "front", bays: 5,
  eaveOverhang: 0.15, gableOverhang: 0.15,
  split: { enabled: true, lowEnd: "left", backLen: 6, drop: 1.5 },
  terrain: { grade: 25, crestOffset: 1.0, margin: 1.0, cutBatter: 1.0, fillBatter: 1.5 },
  fitout: {
    enabled: true, ceiling: 2.7, ceilingPanel: true, gymLen: 3.0,
    bath: { side: "front", width: 2.4, depth: 2.0 },
    stairs: { side: "back", width: 1.0, offset: 0.3 },
  },
  openings: [
    { id: 1, wall: "right", type: "roller", width: 3.0, height: 2.7, offset: 0.25, sill: 0 },
    { id: 2, wall: "right", type: "roller", width: 3.0, height: 2.7, offset: 3.75, sill: 0 },
    { id: 3, wall: "front", type: "pa", width: 0.82, height: 2.04, offset: 7.0 - 0.41, sill: 0 },
    { id: 4, wall: "front", type: "window", width: 1.8, height: 1.2, offset: 3.3, sill: 1.2 },
    { id: 5, wall: "front", type: "window", width: 1.8, height: 1.2, offset: 0.6, sill: 1.2 },
    { id: 6, wall: "left", type: "pa", width: 0.82, height: 2.04, offset: 3.09, sill: 0 },
  ],
  awnings: [],
  colours: {
    walls: "Monument", roof: "Monument", rollerDoors: "Monument", gutter: "Monument",
    barge: "Monument", corner: "Monument", windows: "Monument", paDoors: "Monument",
  },
  show: { dims: true, grid: false, ground: true, slab: true, retaining: true, labels: true, section: false },
};

/* ============================================================================
   Levels & geometry maths (shared by renderer, validator and readouts)
============================================================================ */
const lowSign = (cfg) => (cfg.split.lowEnd === "left" ? -1 : 1);
const splitX = (cfg) => (cfg.split.enabled ? lowSign(cfg) * (cfg.length / 2 - cfg.split.backLen) : null);
const dropOf = (cfg) => (cfg.split.enabled ? cfg.split.drop : 0);
const isLowX = (cfg, x) =>
  cfg.split.enabled && (lowSign(cfg) < 0 ? x < splitX(cfg) : x > splitX(cfg));
const slabYAt = (cfg, x) => (isLowX(cfg, x) ? -dropOf(cfg) : 0);
const lowEndX = (cfg) => (lowSign(cfg) * cfg.length) / 2;
const highEndX = (cfg) => (-lowSign(cfg) * cfg.length) / 2;

function skillionAlongX(cfg) {
  return cfg.skillionLow === "left" || cfg.skillionLow === "right";
}
/** Horizontal run the skillion falls across. */
function skillionRun(cfg) {
  return skillionAlongX(cfg) ? cfg.length : cfg.span;
}
function ridgeHeight(cfg) {
  const t = Math.tan(D(cfg.pitch));
  return cfg.roofType === "gable"
    ? cfg.wallHeight + (cfg.span / 2) * t
    : cfg.wallHeight + skillionRun(cfg) * t;
}

function wallBasis(cfg, wall) {
  const { length: L, span: S } = cfg;
  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  switch (wall) {
    case "front": return { origin: V(-L / 2, 0, S / 2), dir: V(1, 0, 0), out: V(0, 0, 1), w: L };
    case "back": return { origin: V(L / 2, 0, -S / 2), dir: V(-1, 0, 0), out: V(0, 0, -1), w: L };
    case "right": return { origin: V(L / 2, 0, S / 2), dir: V(0, 0, -1), out: V(1, 0, 0), w: S };
    default: return { origin: V(-L / 2, 0, -S / 2), dir: V(0, 0, 1), out: V(-1, 0, 0), w: S };
  }
}
const worldAtU = (cfg, wall, u) => {
  const b = wallBasis(cfg, wall);
  return b.origin.clone().add(b.dir.clone().multiplyScalar(u));
};
const uOfX = (cfg, wall, x) => (wall === "front" ? x + cfg.length / 2 : cfg.length / 2 - x);

/** Underside-of-roof height at any point in plan. The single source of truth for
 *  every wall top edge, so the fall direction can never disagree with the walls. */
function roofTopY(cfg, x, z) {
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

/** Top and base polylines for a wall, in wall-local (u, y). */
function profileFor(cfg, wall) {
  const { span: S, length: L } = cfg;
  const w = isSideWall(wall) ? L : S;
  const at = (u) => {
    const p = worldAtU(cfg, wall, u);
    return [u, roofTopY(cfg, p.x, p.z)];
  };
  // gable ends need the ridge vertex; every other case is linear in u
  const top = cfg.roofType === "gable" && !isSideWall(wall)
    ? [at(0), at(w / 2), at(w)]
    : [at(0), at(w)];

  let base;
  if (!cfg.split.enabled) base = [[0, 0], [w, 0]];
  else if (isSideWall(wall)) {
    const us = uOfX(cfg, wall, splitX(cfg));
    const y0 = slabYAt(cfg, worldAtU(cfg, wall, 0).x);
    const y1 = slabYAt(cfg, worldAtU(cfg, wall, w).x);
    base = [[0, y0], [us, y0], [us, y1], [w, y1]];
  } else {
    const y = slabYAt(cfg, wall === "left" ? -L / 2 : L / 2);
    base = [[0, y], [w, y]];
  }
  return { w, top, base };
}

function sample(pts, u) {
  const x = Math.max(pts[0][0], Math.min(pts[pts.length - 1][0], u));
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (b[0] - a[0] <= 1e-9) continue;
    if (x >= a[0] && x <= b[0]) return a[1] + ((x - a[0]) / (b[0] - a[0])) * (b[1] - a[1]);
  }
  return pts[pts.length - 1][1];
}
const topAt = (prof, u) => sample(prof.top, u);
const baseAt = (prof, u) => sample(prof.base, u);

const isSideWall = (w) => w === "front" || w === "back";
/** Internal height of the lower section: lowest and highest point of the roof
 *  over the low end wall, measured from the lower slab. Works whichever way
 *  the roof falls. */
function backInternal(cfg) {
  const prof = profileFor(cfg, cfg.split.lowEnd);
  const ys = prof.top.map((p) => p[1]);
  const d = dropOf(cfg);
  return { lo: Math.min(...ys) + d, hi: Math.max(...ys) + d };
}
const bayOf = (c) => c.length / c.bays;
const endPostsOf = (c) => Math.max(1, Math.round(c.span / 3));
const endSpacingOf = (c) => c.span / endPostsOf(c);
const spacingFor = (c, w) => (isSideWall(w) ? bayOf(c) : endSpacingOf(c));

/* ---- terrain -------------------------------------------------------------- */
function crestX(cfg) {
  return cfg.split.enabled
    ? splitX(cfg) - lowSign(cfg) * cfg.terrain.crestOffset
    : -lowSign(cfg) * cfg.length / 2;
}
/** Natural surface: flat at RL 0 on the high side of the crest, then falls. */
function naturalY(cfg, x) {
  const c = crestX(cfg);
  const run = lowSign(cfg) < 0 ? c - x : x - c;
  return run > 0 ? -run * (cfg.terrain.grade / 100) : 0;
}
function padSubgrade(cfg, x) {
  return slabYAt(cfg, x) - 0.15;
}
/** Finished surface: benched pad inside the footprint+margin, battered out to natural. */
function terrainY(cfg, x, z) {
  const m = cfg.terrain.margin;
  const x0 = -cfg.length / 2 - m, x1 = cfg.length / 2 + m;
  const z0 = -cfg.span / 2 - m, z1 = cfg.span / 2 + m;
  const cx = Math.max(x0, Math.min(x1, x));
  const cz = Math.max(z0, Math.min(z1, z));
  const P = padSubgrade(cfg, cx);
  const d = Math.hypot(x - cx, z - cz);
  if (d < 1e-6) return P;
  const nat = naturalY(cfg, x);
  return nat > P
    ? Math.min(nat, P + d / cfg.terrain.cutBatter)
    : Math.max(nat, P - d / cfg.terrain.fillBatter);
}
/** Approximate bulk earthworks by sampling the finished vs natural surface. */
function earthworks(cfg) {
  const step = 0.4;
  const R = Math.max(cfg.length, cfg.span) / 2 + 22;
  const cell = step * step;
  let cut = 0, fill = 0, maxCut = 0, maxFill = 0;
  for (let x = -R; x <= R; x += step)
    for (let z = -R; z <= R; z += step) {
      const d = naturalY(cfg, x) - terrainY(cfg, x, z);
      if (d > 0) { cut += d * cell; maxCut = Math.max(maxCut, d); }
      else { fill += -d * cell; maxFill = Math.max(maxFill, -d); }
    }
  return { cut, fill, maxCut, maxFill };
}
/** Retained height along a wall, sampled. */
function retainStats(cfg) {
  if (!cfg.split.enabled) return { max: 0, walls: {} };
  const out = { max: 0, walls: {} };
  ["front", "back", "left", "right"].forEach((w) => {
    const prof = profileFor(cfg, w);
    let mx = 0;
    for (let u = 0; u <= prof.w; u += 0.1) {
      const p = worldAtU(cfg, w, u);
      const h = naturalY(cfg, p.x) - baseAt(prof, u);
      if (h > mx) mx = h;
    }
    out.walls[w] = mx;
    out.max = Math.max(out.max, mx);
  });
  return out;
}

/* ---- fit-out layout ------------------------------------------------------- */
function fitoutPlan(cfg) {
  if (!cfg.split.enabled || !cfg.fitout.enabled) return null;
  const s = lowSign(cfg);
  const sx = splitX(cfg);
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

/* ============================================================================
   Placement solver — shared by the validator's fixes
============================================================================ */
const MIN_H = { roller: 2.0, pa: 1.98, window: 0.5 };
const patchOpening = (cfg, id, patch) => ({
  ...cfg,
  openings: cfg.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
});

/** Every bay on this wall that could legally hold `o`, centred. */
function bayCandidates(cfg, o, level) {
  const prof = profileFor(cfg, o.wall);
  const sp = spacingFor(cfg, o.wall);
  const n = Math.round(prof.w / sp);
  const res = [];
  if (o.width > sp - 2 * COL_HALF - 0.02) return res;
  for (let k = 0; k < n; k++) {
    const off = +(k * sp + (sp - o.width) / 2).toFixed(3);
    if (off < 0.1 || off + o.width > prof.w - 0.1) continue;
    const xm = worldAtU(cfg, o.wall, off + o.width / 2).x;
    if (level && (isLowX(cfg, xm) ? "lower" : "upper") !== level) continue;
    if (cfg.split.enabled && isSideWall(o.wall)) {
      const us = uOfX(cfg, o.wall, splitX(cfg));
      if (off < us - 0.05 && off + o.width > us + 0.05) continue;
    }
    if (cfg.openings.some((x) => x.id !== o.id && x.wall === o.wall &&
      off < x.offset + x.width && x.offset < off + o.width)) continue;
    const bm = baseAt(prof, off + o.width / 2);
    const head = Math.min(topAt(prof, off), topAt(prof, off + o.width)) - bm;
    if (o.sill + o.height > head - 0.15) continue;
    res.push(off);
  }
  return res;
}
/** The legal bay nearest to where the opening already sits. */
function nearestFreeBay(cfg, o, level) {
  const c = bayCandidates(cfg, o, level);
  if (!c.length) return null;
  const mid = o.offset + o.width / 2;
  return c.reduce((best, off) =>
    Math.abs(off + o.width / 2 - mid) < Math.abs(best + o.width / 2 - mid) ? off : best);
}

/* ============================================================================
   Validation
============================================================================ */
function validate(cfg) {
  const out = [];
  const push = (id, sev, msg, fix) => out.push({ id, sev, msg, fix });
  /** fix = { label, apply(cfg) -> cfg | null } */
  const reBay = (o, label, level) => {
    const off = nearestFreeBay(cfg, o, level);
    return off === null ? null : { label, apply: (c) => patchOpening(c, o.id, { offset: off }) };
  };

  cfg.openings.forEach((o, i) => {
    const label = `${TYPE_LABEL[o.type]} ${i + 1} · ${o.wall}`;
    const prof = profileFor(cfg, o.wall);
    const W = prof.w, a = o.offset, b = o.offset + o.width;
    const sp = spacingFor(cfg, o.wall);
    const n = Math.round(W / sp);

    const clear = sp - 2 * COL_HALF;
    const bm = baseAt(prof, a + o.width / 2);
    const headroom = Math.min(topAt(prof, a), topAt(prof, b)) - bm;

    if (a < 0 || b > W)
      return push(o.id, "err", `${label}: runs past the end of the wall.`,
        reBay(o, "Bring it back onto the wall") || {
          label: "Clamp to the wall",
          apply: (c) => patchOpening(c, o.id, { offset: +Math.max(0.1, Math.min(W - o.width - 0.1, o.offset)).toFixed(3) }),
        });

    if (a < 0.1 || b > W - 0.1)
      push(o.id, "warn", `${label}: under 100 mm to the corner column.`,
        reBay(o, "Centre it in the end bay"));

    if (cfg.split.enabled && isSideWall(o.wall)) {
      const us = uOfX(cfg, o.wall, splitX(cfg));
      if (a < us - 0.05 && b > us + 0.05) {
        // keep it on whichever level it mostly sits over
        const lvlU = Math.max(0, Math.min(W, us));
        const lower = (o.wall === "front") === (cfg.split.lowEnd === "left");
        const overLow = lower ? lvlU - a : b - lvlU;
        const target = overLow > o.width / 2 ? "lower" : "upper";
        push(o.id, "err", `${label}: straddles the slab step at ${us.toFixed(2)} m. The wall changes level there.`,
          reBay(o, `Move it onto the ${target} level`, target) || reBay(o, "Move it clear of the step"));
      }
    }

    const member = isSideWall(o.wall) ? "portal column" : "end post";
    for (let k = 1; k < n; k++) {
      const cc = k * sp;
      if (a < cc + COL_HALF && b > cc - COL_HALF)
        push(o.id, "err", `${label}: clashes with the ${member} at ${cc.toFixed(2)} m.`,
          reBay(o, "Centre it in the nearest free bay"));
      else if (Math.min(Math.abs(a - cc), Math.abs(b - cc)) < 0.15)
        push(o.id, "warn", `${label}: within 150 mm of the ${member} at ${cc.toFixed(2)} m.`,
          reBay(o, "Centre it in the bay"));
    }

    if (o.width > clear) {
      // widen the bay if the wall's spacing is ours to set, otherwise narrow the opening
      const fix = isSideWall(o.wall)
        ? (() => {
            const nb = Math.floor(cfg.length / (o.width + 2 * COL_HALF + 0.04));
            return nb >= 1 && nb < cfg.bays
              ? { label: `Widen the bays: ${nb} frames @ ${(cfg.length / nb).toFixed(2)} m`, apply: (c) => ({ ...c, bays: nb }) }
              : null;
          })()
        : { label: `Narrow it to ${(clear - 0.02).toFixed(2)} m`, apply: (c) => patchOpening(c, o.id, { width: +(clear - 0.02).toFixed(2) }) };
      push(o.id, "err", `${label}: ${o.width.toFixed(2)} m will not fit a ${sp.toFixed(2)} m bay (${clear.toFixed(2)} m clear).`, fix);
    }

    if (o.sill + o.height > headroom - 0.15) {
      const newH = +(headroom - 0.15 - o.sill).toFixed(2);
      let fix;
      if (newH >= MIN_H[o.type])
        fix = { label: `Reduce the height to ${newH.toFixed(2)} m`, apply: (c) => patchOpening(c, o.id, { height: newH }) };
      else if (o.sill > 0.01 && headroom - 0.15 - o.height >= 0)
        fix = { label: `Drop the sill to ${(headroom - 0.15 - o.height).toFixed(2)} m`, apply: (c) => patchOpening(c, o.id, { sill: +(headroom - 0.15 - o.height).toFixed(2) }) };
      else {
        const need = +(cfg.wallHeight + (o.sill + o.height) - (headroom - 0.15)).toFixed(2);
        fix = { label: `Raise the wall to ${need.toFixed(2)} m`, apply: (c) => ({ ...c, wallHeight: need }) };
      }
      push(o.id, "err", `${label}: head at ${(o.sill + o.height).toFixed(2)} m over a ${headroom.toFixed(2)} m wall. Allow ~150 mm for the header.`, fix);
    }

    if (o.type === "roller" && o.sill > 0.01)
      push(o.id, "warn", `${label}: roller doors normally sit on the slab.`,
        { label: "Sit it on the slab", apply: (c) => patchOpening(c, o.id, { sill: 0 }) });

    // below the cut face?
    if (cfg.split.enabled) {
      const nat = naturalY(cfg, worldAtU(cfg, o.wall, a + o.width / 2).x);
      const sillY = bm + o.sill, headY = sillY + o.height;
      const raise = { label: `Raise the sill to ${(nat - bm + 0.1).toFixed(2)} m, clear of the ground`,
        apply: (c) => patchOpening(c, o.id, { sill: +(nat - bm + 0.1).toFixed(2) }) };
      if (headY < nat - 0.02)
        push(o.id, "err", `${label}: entirely below the cut face. Natural ground is ${(nat - headY).toFixed(2)} m above the head.`,
          reBay(o, "Move it to a bay above ground") || raise);
      else if (sillY < nat - 0.02)
        push(o.id, "warn", `${label}: sill sits ${(nat - sillY).toFixed(2)} m below natural ground. Needs a retained lightwell or a higher sill.`, raise);
    }
  });

  for (let i = 0; i < cfg.openings.length; i++)
    for (let j = i + 1; j < cfg.openings.length; j++) {
      const A = cfg.openings[i], B = cfg.openings[j];
      if (A.wall !== B.wall) continue;
      if (A.offset < B.offset + B.width && B.offset < A.offset + A.width)
        push(A.id, "err", `${TYPE_LABEL[A.type]} ${i + 1} and ${TYPE_LABEL[B.type]} ${j + 1} overlap on the ${A.wall} wall.`,
          reBay(B, `Move ${TYPE_LABEL[B.type]} ${j + 1} to a free bay`) ||
          reBay(A, `Move ${TYPE_LABEL[A.type]} ${i + 1} to a free bay`));
    }

  if (bayOf(cfg) > 6)
    push(0, "warn", `Bay spacing ${bayOf(cfg).toFixed(2)} m is over 6 m. Most shed systems need heavier portals past that.`,
      { label: `Go to ${Math.ceil(cfg.length / 6)} bays @ ${(cfg.length / Math.ceil(cfg.length / 6)).toFixed(2)} m`,
        apply: (c) => ({ ...c, bays: Math.ceil(c.length / 6) }) });
  if (bayOf(cfg) < 2)
    push(0, "warn", `Bay spacing ${bayOf(cfg).toFixed(2)} m is unusually tight.`,
      { label: `Go to ${Math.max(1, Math.floor(cfg.length / 3))} bays @ ${(cfg.length / Math.max(1, Math.floor(cfg.length / 3))).toFixed(2)} m`,
        apply: (c) => ({ ...c, bays: Math.max(1, Math.floor(c.length / 3)) }) });

  /* ---- split level ---- */
  if (cfg.split.enabled) {
    const s = lowSign(cfg);
    const sxU = splitX(cfg);
    // a column should land on the step, otherwise the step lands mid-bay
    const uSplit = sxU + cfg.length / 2;
    const k = uSplit / bayOf(cfg);
    if (Math.abs(k - Math.round(k)) > 0.02) {
      const kk = Math.max(1, Math.min(cfg.bays - 1, Math.round(k)));
      const nx = -cfg.length / 2 + kk * bayOf(cfg);
      const nb = +(cfg.split.lowEnd === "left" ? nx + cfg.length / 2 : cfg.length / 2 - nx).toFixed(3);
      push(0, "warn", `The slab step sits ${(Math.abs(k - Math.round(k)) * bayOf(cfg)).toFixed(2)} m off the nearest bay line. Landing the step on a portal frame makes the step wall and the retaining nib far easier to build.`,
        { label: `Snap the step to frame ${kk} · lower section ${nb.toFixed(2)} m`, apply: (c) => ({ ...c, split: { ...c.split, backLen: nb } }) });
    }

    const nat = naturalY(cfg, sxU);
    const cutAtStep = nat - -cfg.split.drop;
    if (cutAtStep > 0) push(0, "note", `Cut at the step line is ${cutAtStep.toFixed(2)} m. The lower slab is a benched cut, not fill.`);

    const rs = retainStats(cfg);
    if (rs.max > 1.0)
      push(0, "note", `Max retained height against the shed walls is ${rs.max.toFixed(2)} m. Retaining over 1 m generally needs building approval and engineering in Queensland, and a surcharge from a slab or driveway above changes that threshold. Verify with a certifier.`);
    else if (rs.max > 0.1)
      push(0, "note", `Max retained height is ${rs.max.toFixed(2)} m.`);

    const ew = earthworks(cfg);
    push(0, "note", `Bulk earthworks approx ${Math.round(ew.cut)} m³ cut / ${Math.round(ew.fill)} m³ fill, deepest cut ${ew.maxCut.toFixed(2)} m. Sampled from the surface model, no bulking factor, no topsoil strip.`);

    const fall = (cfg.terrain.grade / 100) * cfg.split.backLen;
    if (fall < cfg.split.drop * 0.4) {
      const nd = +Math.max(0.2, Math.round(fall / 0.05) * 0.05).toFixed(2);
      push(0, "warn", `The ground only falls ${fall.toFixed(2)} m across the lower section but the slab drops ${cfg.split.drop.toFixed(2)} m. You are cutting a deep hole rather than following the fall.`,
        { label: `Match the drop to the fall: ${nd.toFixed(2)} m`, apply: (c) => ({ ...c, split: { ...c.split, drop: nd } }) });
    }
  }

  /* ---- fit-out ---- */
  if (cfg.split.enabled && cfg.fitout.enabled) {
    const f = cfg.fitout;
    const BI = backInternal(cfg).lo;
    const flatLen = cfg.split.backLen - f.gymLen;
    if (flatLen < 2.5)
      push(0, "err", `Only ${flatLen.toFixed(2)} m left for the granny flat. Shorten the gym or lengthen the lower section.`,
        cfg.split.backLen - 2.5 >= 1
          ? { label: `Shorten the gym to ${(cfg.split.backLen - 2.5).toFixed(2)} m`, apply: (c) => ({ ...c, fitout: { ...c.fitout, gymLen: +(c.split.backLen - 2.5).toFixed(2) } }) }
          : { label: `Lengthen the lower section to ${(f.gymLen + 2.5).toFixed(2)} m`, apply: (c) => ({ ...c, split: { ...c.split, backLen: +Math.min(c.length - 3, c.fitout.gymLen + 2.5).toFixed(2) } }) });
    if (f.bath.depth > flatLen - 0.5)
      push(0, "err", `Bathroom depth ${f.bath.depth.toFixed(2)} m does not fit in a ${flatLen.toFixed(2)} m granny flat.`,
        flatLen - 0.5 >= 1.2
          ? { label: `Reduce the bathroom depth to ${(flatLen - 0.5).toFixed(2)} m`, apply: (c) => ({ ...c, fitout: { ...c.fitout, bath: { ...c.fitout.bath, depth: +(flatLen - 0.5).toFixed(2) } } }) }
          : { label: `Shorten the gym to make room`, apply: (c) => ({ ...c, fitout: { ...c.fitout, gymLen: +Math.max(1, c.split.backLen - c.fitout.bath.depth - 0.5).toFixed(2) } }) });
    if (f.bath.width > cfg.span - 1.5)
      push(0, "warn", `Bathroom width leaves under 1.5 m of the granny flat beside it.`,
        { label: `Reduce the width to ${(cfg.span - 1.5).toFixed(2)} m`, apply: (c) => ({ ...c, fitout: { ...c.fitout, bath: { ...c.fitout.bath, width: +(c.span - 1.5).toFixed(2) } } }) });
    if (f.ceiling < 2.4)
      push(0, "err", `Ceiling at ${f.ceiling.toFixed(2)} m. NCC requires 2.4 m minimum for habitable rooms (2.1 m for a bathroom or laundry). A gym you use is habitable.`,
        { label: BI - 2.4 < 0.3 ? `Set 2.40 m and raise the wall to suit` : `Set the ceiling to 2.40 m`,
          apply: (c) => ({
            ...c,
            wallHeight: BI - 2.4 < 0.3 ? +(c.wallHeight + (2.7 - BI)).toFixed(2) : c.wallHeight,
            fitout: { ...c.fitout, ceiling: 2.4 },
          }) });
    else if (BI - f.ceiling < 0.3) {
      const nc = +(BI - 0.3).toFixed(2);
      push(0, "warn", `Under 300 mm between the ceiling and the eave line. No room for the roof battens or a services void.`,
        nc >= 2.4
          ? { label: `Drop the ceiling to ${nc.toFixed(2)} m`, apply: (c) => ({ ...c, fitout: { ...c.fitout, ceiling: nc } }) }
          : { label: `Raise the wall to ${(cfg.wallHeight + (2.7 - BI)).toFixed(2)} m`, apply: (c) => ({ ...c, wallHeight: +(c.wallHeight + (2.7 - BI)).toFixed(2), fitout: { ...c.fitout, ceiling: 2.4 } }) });
    }

    const risers = Math.ceil(cfg.split.drop / 0.19);
    const riser = cfg.split.drop / risers;
    push(0, "note", `Stair: ${risers} risers at ${(riser * 1000).toFixed(0)} mm, ${(risers * 0.25).toFixed(2)} m run. NCC private stair riser range is 115–190 mm with 250 mm going.`);
    push(0, "note", `A gym and a granny flat make this a Class 1a building, not a Class 10a shed. Different fire, energy, waterproofing and habitable-room rules apply, and on the Sunshine Coast a secondary dwelling has its own planning tests. The shed supplier's kit almost certainly is not certified for it as drawn.`);

    const grannyArea = (cfg.split.backLen - f.gymLen) * cfg.span - f.bath.width * f.bath.depth;
    push(0, "note", `Areas: parking ${((cfg.length - cfg.split.backLen) * cfg.span).toFixed(1)} m², gym ${(f.gymLen * cfg.span).toFixed(1)} m², granny flat ${grannyArea.toFixed(1)} m², bathroom ${(f.bath.width * f.bath.depth).toFixed(1)} m².`);
  }

  cfg.awnings.forEach((aw, i) => {
    const W = wallBasis(cfg, aw.side).w;
    if (aw.offset + aw.length > W + 1e-6)
      push(-1 - i, "err", `Lean-to ${i + 1}: extends ${(aw.offset + aw.length - W).toFixed(2)} m past the ${aw.side} wall.`,
        { label: `Trim it to ${(W - aw.offset).toFixed(2)} m`,
          apply: (c) => ({ ...c, awnings: c.awnings.map((x, k) => (k === i ? { ...x, length: +(W - x.offset).toFixed(2) } : x)) }) });
  });

  return out;
}

function snapToBay(cfg, o) {
  const prof = profileFor(cfg, o.wall);
  const sp = spacingFor(cfg, o.wall);
  const n = Math.round(prof.w / sp);
  const k = Math.max(0, Math.min(n - 1, Math.floor((o.offset + o.width / 2) / sp)));
  return +(k * sp + (sp - o.width) / 2).toFixed(3);
}

/* ============================================================================
   Textures / sprites
============================================================================ */
function ribCanvas(vertical) {
  const c = document.createElement("canvas");
  c.width = vertical ? 128 : 8;
  c.height = vertical ? 8 : 128;
  const g = c.getContext("2d");
  const grad = vertical ? g.createLinearGradient(0, 0, 128, 0) : g.createLinearGradient(0, 0, 0, 128);
  [[0, "#ffffff"], [0.3, "#f4f4f4"], [0.4, "#b4b4b4"], [0.47, "#8f8f8f"],
   [0.53, "#ffffff"], [0.6, "#b4b4b4"], [0.7, "#f4f4f4"], [1, "#ffffff"]]
    .forEach(([p, col]) => grad.addColorStop(p, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
function makeRib({ vertical = true, repeat = [5, 1] } = {}) {
  const t = new THREE.CanvasTexture(ribCanvas(vertical));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}
function grassTexture(rep) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  g.fillStyle = "#6f8f4a";
  g.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 6000; i++) {
    g.fillStyle = `hsl(${76 + Math.random() * 24}, ${26 + Math.random() * 24}%, ${16 + Math.random() * 22}%)`;
    g.fillRect(Math.random() * 128, Math.random() * 128, 1.6, 1.6);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rep, rep);
  t.anisotropy = 8;
  return t;
}
function skyTexture() {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#5d8cc4"); grad.addColorStop(0.55, "#a8c4dd"); grad.addColorStop(1, "#dfe6e6");
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}
function textSprite(text, tone = "dim") {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d");
  const font = "600 44px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w; c.height = 64;
  const g = c.getContext("2d");
  g.font = font; g.textBaseline = "middle"; g.textAlign = "center";
  g.fillStyle = tone === "room" ? "rgba(245,158,11,0.9)" : "rgba(17,19,23,0.88)";
  g.fillRect(0, 8, w, 48);
  g.fillStyle = tone === "room" ? "#1c1917" : "#f2f4f6";
  g.fillText(text, w / 2, 32);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false, transparent: true }));
  s.scale.set((w / 64) * 0.62, 0.62, 1);
  s.renderOrder = 999;
  return s;
}

/* ============================================================================
   Scene builder
============================================================================ */
function buildShed(cfg) {
  const root = new THREE.Group();
  const c = cfg.colours;
  const drop = dropOf(cfg);
  const p = D(cfg.pitch);
  const ridgeY = ridgeHeight(cfg);
  const eaveOh = cfg.eaveOverhang;
  const gblOh = cfg.gableOverhang;

  const steel = (name, tex) => new THREE.MeshStandardMaterial({
    color: new THREE.Color(hexOf(name)), map: tex || null,
    metalness: 0.32, roughness: 0.56, side: THREE.DoubleSide,
  });
  const CONCRETE = new THREE.MeshStandardMaterial({ color: 0xb9b7b2, roughness: 0.95, metalness: 0 });
  const RETAIN = new THREE.MeshStandardMaterial({ color: 0x9a968f, roughness: 0.98, metalness: 0 });
  const PLASTER = new THREE.MeshStandardMaterial({ color: 0xe8e6e1, roughness: 0.9, metalness: 0, side: THREE.DoubleSide });
  const TILE = new THREE.MeshStandardMaterial({ color: 0xd8dcdb, roughness: 0.35, metalness: 0.05 });
  const LEAF = new THREE.MeshStandardMaterial({ color: 0xf2f0eb, roughness: 0.7, metalness: 0 });
  const METAL = new THREE.MeshStandardMaterial({ color: 0xc9ccd1, metalness: 0.8, roughness: 0.3 });
  const GLASS = new THREE.MeshStandardMaterial({
    color: 0x93b7c9, metalness: 0.15, roughness: 0.08, transparent: true, opacity: 0.42,
  });
  const wallMat = steel(c.walls, makeRib({ vertical: true, repeat: [1 / 0.2, 1] }));
  const trim = (n) => steel(n);

  /* ---- terrain ---- */
  if (cfg.show.ground) {
    const SIZE = 70, SEG = 260;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainY(cfg, pos.getX(i), pos.getZ(i)) - 0.01);
    pos.needsUpdate = true;
    g.computeVertexNormals();
    const mesh = new THREE.Mesh(g, new THREE.MeshStandardMaterial({
      map: grassTexture(SIZE / 0.5), roughness: 1, metalness: 0,
    }));
    mesh.receiveShadow = true;
    root.add(mesh);
  }

  /* ---- external walls ---- */
  WALLS.forEach(([wall]) => {
    if (cfg.show.section && wall === "front") return; // cutaway
    const b = wallBasis(cfg, wall);
    const prof = profileFor(cfg, wall);
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.matrix = new THREE.Matrix4().makeBasis(b.dir, new THREE.Vector3(0, 1, 0), b.out).setPosition(b.origin);

    const shape = new THREE.Shape();
    shape.moveTo(prof.base[0][0], prof.base[0][1]);
    prof.base.slice(1).forEach(([u, y]) => shape.lineTo(u, y));
    for (let i = prof.top.length - 1; i >= 0; i--) shape.lineTo(prof.top[i][0], prof.top[i][1]);
    shape.closePath();

    const mine = cfg.openings.filter((o) => o.wall === wall);
    const yOf = (o) => baseAt(prof, o.offset + o.width / 2) + o.sill;
    mine.forEach((o) => {
      const y = yOf(o);
      const h = new THREE.Path();
      h.moveTo(o.offset, y);
      h.lineTo(o.offset + o.width, y);
      h.lineTo(o.offset + o.width, y + o.height);
      h.lineTo(o.offset, y + o.height);
      h.closePath();
      shape.holes.push(h);
    });

    const geo = new THREE.ExtrudeGeometry(shape, { depth: 0.05, bevelEnabled: false });
    geo.translate(0, 0, -0.05);
    const mesh = new THREE.Mesh(geo, wallMat);
    mesh.castShadow = mesh.receiveShadow = true;
    g.add(mesh);

    mine.forEach((o) => {
      const y = yOf(o), cxu = o.offset + o.width / 2;
      if (o.type === "roller") {
        const m = new THREE.Mesh(
          new THREE.PlaneGeometry(o.width, o.height),
          steel(c.rollerDoors, makeRib({ vertical: false, repeat: [1, o.height / 0.1] }))
        );
        m.position.set(cxu, y + o.height / 2, -0.06);
        m.castShadow = true;
        g.add(m);
        const hood = new THREE.Mesh(new THREE.BoxGeometry(o.width + 0.12, 0.18, 0.12), trim(c.rollerDoors));
        hood.position.set(cxu, y + o.height + 0.09, -0.02);
        g.add(hood);
      } else if (o.type === "pa") {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(o.width, o.height), steel(c.paDoors));
        m.position.set(cxu, y + o.height / 2, -0.05);
        g.add(m);
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.1), METAL);
        hd.position.set(o.offset + o.width - 0.1, y + 1.02, 0.01);
        g.add(hd);
      } else {
        const m = new THREE.Mesh(new THREE.PlaneGeometry(o.width - 0.08, o.height - 0.08), GLASS);
        m.position.set(cxu, y + o.height / 2, -0.03);
        g.add(m);
        const fm = trim(c.windows);
        [[o.width, 0.05, cxu, y + 0.025], [o.width, 0.05, cxu, y + o.height - 0.025],
         [0.05, o.height, o.offset + 0.025, y + o.height / 2],
         [0.05, o.height, o.offset + o.width - 0.025, y + o.height / 2],
         [0.04, o.height, cxu, y + o.height / 2]].forEach(([w, h, x, yy]) => {
          const bar = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), fm);
          bar.position.set(x, yy, -0.01);
          g.add(bar);
        });
      }
    });

    if (cfg.show.grid) {
      const sp = spacingFor(cfg, wall);
      const n = Math.round(prof.w / sp);
      const om = new THREE.MeshBasicMaterial({ color: 0xff9f43, transparent: true, opacity: 0.55 });
      for (let k = 0; k <= n; k++) {
        const u = k * sp, bY = baseAt(prof, u), tY = topAt(prof, u);
        const strip = new THREE.Mesh(new THREE.PlaneGeometry(2 * COL_HALF, tY - bY), om);
        strip.position.set(u, (tY + bY) / 2, 0.02);
        g.add(strip);
      }
    }

    /* retaining wall where the cut face bears on this wall */
    if (cfg.show.retaining && cfg.split.enabled) {
      const pts = [];
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * prof.w;
        const nat = naturalY(cfg, worldAtU(cfg, wall, u).x);
        pts.push([u, Math.max(baseAt(prof, u), Math.min(nat + 0.15, topAt(prof, u)))]);
      }
      const hasCut = pts.some(([u, y], i) => y - baseAt(prof, u) > 0.08);
      if (hasCut) {
        const sh = new THREE.Shape();
        sh.moveTo(0, baseAt(prof, 0));
        for (let i = 0; i <= N; i++) sh.lineTo((i / N) * prof.w, baseAt(prof, (i / N) * prof.w));
        for (let i = N; i >= 0; i--) sh.lineTo(pts[i][0], pts[i][1]);
        sh.closePath();
        const rg = new THREE.ExtrudeGeometry(sh, { depth: 0.2, bevelEnabled: false });
        rg.translate(0, 0, -0.26);
        const rw = new THREE.Mesh(rg, RETAIN);
        rw.castShadow = rw.receiveShadow = true;
        g.add(rw);
      }
    }
    root.add(g);
  });

  /* ---- roof ---- */
  const roofTex = () => makeRib({ vertical: true, repeat: [(cfg.length + 2 * gblOh) / 0.2, 1] });
  if (cfg.roofType === "gable") {
    const dMid = (cfg.span / 2 + eaveOh) / 2;
    const slope = (cfg.span / 2 + eaveOh) / Math.cos(p);
    [-1, 1].forEach((s) => {
      if (cfg.show.section && s === 1) return;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(cfg.length + 2 * gblOh, slope), steel(c.roof, roofTex()));
      m.rotation.x = -Math.PI / 2 + s * p;
      m.position.set(0, ridgeY - dMid * Math.tan(p), s * dMid);
      m.castShadow = m.receiveShadow = true;
      root.add(m);
    });
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(cfg.length + 2 * gblOh, 0.06, 0.34), trim(c.barge));
    ridge.position.set(0, ridgeY + 0.05, 0);
    root.add(ridge);
    [-1, 1].forEach((sx) => [-1, 1].forEach((sz) => {
      const barge = new THREE.Mesh(new THREE.BoxGeometry(0.14, slope, 0.05), trim(c.barge));
      barge.rotation.x = -Math.PI / 2 + sz * p;
      barge.position.set(sx * (cfg.length / 2 + gblOh - 0.06), ridgeY - dMid * Math.tan(p) + 0.05, sz * dMid);
      root.add(barge);
    }));
  } else {
    // Orient a group so the fall always runs toward local +z, then reuse the
    // same plane maths for all four directions.
    const yaw = { front: 0, back: Math.PI, right: Math.PI / 2, left: -Math.PI / 2 }[cfg.skillionLow];
    const run = skillionRun(cfg);
    const wid = skillionAlongX(cfg) ? cfg.span : cfg.length;
    const G = new THREE.Group();
    G.rotation.y = yaw;

    const slope = (run + 2 * eaveOh) / Math.cos(p);
    const midY = cfg.wallHeight + (run / 2) * Math.tan(p);
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(wid + 2 * gblOh, slope),
      steel(c.roof, makeRib({ vertical: true, repeat: [(wid + 2 * gblOh) / 0.2, 1] }))
    );
    m.rotation.x = -Math.PI / 2 + p;
    m.position.set(0, midY, 0);
    m.castShadow = m.receiveShadow = true;
    G.add(m);

    [-1, 1].forEach((sx) => {
      const barge = new THREE.Mesh(new THREE.BoxGeometry(0.14, slope, 0.05), trim(c.barge));
      barge.rotation.x = -Math.PI / 2 + p;
      barge.position.set(sx * (wid / 2 + gblOh - 0.06), midY + 0.05, 0);
      G.add(barge);
    });

    // gutter on the low edge, capping on the high edge
    const gt = new THREE.Mesh(new THREE.BoxGeometry(wid + 2 * gblOh, 0.13, 0.15), trim(c.gutter));
    gt.position.set(0, cfg.wallHeight - 0.07, run / 2 + 0.09);
    G.add(gt);
    const cap = new THREE.Mesh(new THREE.BoxGeometry(wid + 2 * gblOh, 0.06, 0.3), trim(c.barge));
    cap.position.set(0, cfg.wallHeight + run * Math.tan(p) + 0.05, -run / 2 - 0.05);
    G.add(cap);
    root.add(G);
  }

  /* ---- gutters ---- */
  const gutterAt = (z, y) => {
    const gt = new THREE.Mesh(new THREE.BoxGeometry(cfg.length + 2 * gblOh, 0.13, 0.15), trim(c.gutter));
    gt.position.set(0, y - 0.07, z);
    root.add(gt);
  };
  if (cfg.roofType === "gable") {
    gutterAt(cfg.span / 2 + 0.09, cfg.wallHeight);
    gutterAt(-(cfg.span / 2 + 0.09), cfg.wallHeight);
  }

  /* ---- corner flashings ---- */
  WALLS.forEach(([wall]) => {
    const b = wallBasis(cfg, wall);
    const prof = profileFor(cfg, wall);
    const t = topAt(prof, 0), bs = baseAt(prof, 0);
    const fl = new THREE.Mesh(new THREE.BoxGeometry(0.13, t - bs, 0.13), trim(c.corner));
    fl.position.copy(b.origin).add(b.dir.clone().multiplyScalar(0.06)).add(b.out.clone().multiplyScalar(0.03));
    fl.position.y = (t + bs) / 2;
    root.add(fl);
  });

  /* ---- slabs & step ---- */
  if (cfg.show.slab) {
    const pad = 0.1, S = cfg.span + 2 * pad;
    const mkSlab = (x0, x1, topY) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), 0.15, S), CONCRETE);
      s.position.set((x0 + x1) / 2, topY - 0.075, 0);
      s.receiveShadow = true;
      root.add(s);
    };
    if (cfg.split.enabled) {
      const sx = splitX(cfg);
      mkSlab(sx, highEndX(cfg) + lowSign(cfg) * -pad, 0);
      mkSlab(lowEndX(cfg) + lowSign(cfg) * pad, sx, -drop);
      const riser = new THREE.Mesh(new THREE.BoxGeometry(0.2, drop, S), RETAIN);
      riser.position.set(sx - lowSign(cfg) * 0.1, -drop / 2, 0);
      riser.castShadow = riser.receiveShadow = true;
      root.add(riser);
    } else {
      mkSlab(-cfg.length / 2 - pad, cfg.length / 2 + pad, 0);
    }
  }

  /* ---- fit-out ---- */
  const plan = fitoutPlan(cfg);
  if (plan) {
    const { s, sx, ex, gymEnd, bathZ, bathZi, bathXi, base, top, S } = plan;

    const partition = (a, b, y0, y1, doors, mat) => {
      const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
      const len = dir.length();
      if (len < 0.05) return;
      dir.normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const out = new THREE.Vector3().crossVectors(dir, up);
      const g = new THREE.Group();
      g.matrixAutoUpdate = false;
      g.matrix = new THREE.Matrix4().makeBasis(dir, up, out).setPosition(new THREE.Vector3(a.x, 0, a.z));
      const sh = new THREE.Shape();
      sh.moveTo(0, y0); sh.lineTo(len, y0); sh.lineTo(len, y1); sh.lineTo(0, y1); sh.closePath();
      (doors || []).forEach((d) => {
        const u0 = Math.max(0.05, Math.min(len - d.w - 0.05, d.u - d.w / 2));
        const h = new THREE.Path();
        h.moveTo(u0, y0); h.lineTo(u0 + d.w, y0); h.lineTo(u0 + d.w, y0 + d.h); h.lineTo(u0, y0 + d.h); h.closePath();
        sh.holes.push(h);
        const leaf = new THREE.Mesh(new THREE.PlaneGeometry(d.w - 0.04, d.h - 0.03), LEAF);
        leaf.position.set(u0 + d.w / 2, y0 + d.h / 2, 0);
        g.add(leaf);
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.1), METAL);
        hd.position.set(u0 + d.w - 0.1, y0 + 1.02, 0);
        g.add(hd);
      });
      const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.09, bevelEnabled: false });
      geo.translate(0, 0, -0.045);
      const m = new THREE.Mesh(geo, mat);
      m.castShadow = m.receiveShadow = true;
      g.add(m);
      root.add(g);
    };

    // gym | granny flat divider, door offset away from the bathroom side
    const doorZ = cfg.fitout.bath.side === "front" ? -S / 4 : S / 4;
    partition(
      { x: gymEnd, z: -S / 2 }, { x: gymEnd, z: S / 2 },
      base, top, [{ u: doorZ + S / 2, w: 0.9, h: 2.04 }], PLASTER
    );

    // bathroom: wall parallel to the end wall, and wall parallel to the side wall
    partition({ x: bathXi, z: bathZ }, { x: bathXi, z: bathZi }, base, base + Math.min(cfg.fitout.ceiling, 2.4), [], PLASTER);
    partition(
      { x: ex, z: bathZi }, { x: bathXi, z: bathZi },
      base, base + Math.min(cfg.fitout.ceiling, 2.4),
      [{ u: cfg.fitout.bath.depth / 2, w: 0.82, h: 2.04 }], PLASTER
    );
    const bathFloor = new THREE.Mesh(
      new THREE.PlaneGeometry(cfg.fitout.bath.depth, cfg.fitout.bath.width), TILE
    );
    bathFloor.rotation.x = -Math.PI / 2;
    bathFloor.position.set((ex + bathXi) / 2, base + 0.01, (bathZ + bathZi) / 2);
    root.add(bathFloor);

    // ceiling over the granny flat + bathroom
    if (cfg.fitout.ceilingPanel) {
      const cl = Math.abs(gymEnd - ex);
      const cp = new THREE.Mesh(new THREE.PlaneGeometry(cl, S), PLASTER);
      cp.rotation.x = Math.PI / 2;
      cp.position.set((gymEnd + ex) / 2, top, 0);
      root.add(cp);
    }

    /* stairs down from the parking level */
    const st = cfg.fitout.stairs;
    const risers = Math.ceil(drop / 0.19);
    const rh = drop / risers, tread = 0.25;
    const z0 = st.side === "front" ? S / 2 - st.offset - st.width : -S / 2 + st.offset;
    for (let k = 1; k <= risers; k++) {
      const xA = sx + s * (k - 1) * tread, xB = sx + s * k * tread;
      const stepTop = -rh * k;
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(tread, stepTop - base, st.width), CONCRETE
      );
      box.position.set((xA + xB) / 2, (stepTop + base) / 2, z0 + st.width / 2);
      box.castShadow = box.receiveShadow = true;
      root.add(box);
    }
    // balustrade at the step edge, broken at the stair
    const rail = (za, zb) => {
      if (Math.abs(zb - za) < 0.1) return;
      [1.0, 0.5].forEach((h) => {
        const r = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, Math.abs(zb - za)), METAL);
        r.position.set(sx + s * 0.06, h, (za + zb) / 2);
        root.add(r);
      });
      for (let t = 0; t <= 1.001; t += 0.25) {
        const post = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.0, 0.05), METAL);
        post.position.set(sx + s * 0.06, 0.5, za + (zb - za) * t);
        root.add(post);
      }
    };
    rail(-S / 2, z0);
    rail(z0 + st.width, S / 2);

    if (cfg.show.labels) {
      const lbl = (x, z, t) => {
        const sp2 = textSprite(t, "room");
        sp2.position.set(x, base + 0.9, z);
        root.add(sp2);
      };
      lbl((sx + gymEnd) / 2, 0, "GYM");
      lbl((gymEnd + bathXi) / 2, cfg.fitout.bath.side === "front" ? -S / 4 : S / 4, "GRANNY FLAT");
      lbl((ex + bathXi) / 2, (bathZ + bathZi) / 2, "BATH");
      const park = textSprite("PARKING", "room");
      park.position.set((sx + highEndX(cfg)) / 2, 0.9, 0);
      root.add(park);
    }
  }

  /* ---- lean-tos ---- */
  cfg.awnings.forEach((aw) => {
    const b = wallBasis(cfg, aw.side);
    const prof = profileFor(cfg, aw.side);
    const attachY = Math.min(topAt(prof, aw.offset), topAt(prof, aw.offset + aw.length)) - 0.05;
    const ap = D(aw.pitch);
    const outerY = attachY - aw.projection * Math.tan(ap);
    const g = new THREE.Group();
    g.matrixAutoUpdate = false;
    g.matrix = new THREE.Matrix4().makeBasis(b.dir, new THREE.Vector3(0, 1, 0), b.out).setPosition(b.origin);
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(aw.length, aw.projection / Math.cos(ap)),
      steel(c.roof, makeRib({ vertical: true, repeat: [aw.length / 0.2, 1] }))
    );
    sheet.rotation.x = -Math.PI / 2 + ap;
    sheet.position.set(aw.offset + aw.length / 2, (attachY + outerY) / 2, aw.projection / 2);
    sheet.castShadow = true;
    g.add(sheet);
    const fascia = new THREE.Mesh(new THREE.BoxGeometry(aw.length + 0.1, 0.16, 0.12), trim(c.gutter));
    fascia.position.set(aw.offset + aw.length / 2, outerY - 0.08, aw.projection + 0.05);
    g.add(fascia);
    const n = Math.max(2, Math.round(aw.length / bayOf(cfg)) + 1);
    for (let k = 0; k < n; k++) {
      const u = aw.offset + (aw.length * k) / (n - 1);
      const gy = terrainY(cfg, ...(() => {
        const w = worldAtU(cfg, aw.side, u).add(b.out.clone().multiplyScalar(aw.projection - 0.05));
        return [w.x, w.z];
      })());
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, outerY - gy - 0.1, 0.1), trim(c.corner));
      post.position.set(
        Math.max(aw.offset + 0.05, Math.min(aw.offset + aw.length - 0.05, u)),
        (outerY - 0.1 + gy) / 2, aw.projection - 0.05
      );
      post.castShadow = true;
      g.add(post);
    }
    root.add(g);
  });

  /* ---- dimensions ---- */
  if (cfg.show.dims) {
    const V = (x, y, z) => new THREE.Vector3(x, y, z);
    const dim = (a, b, label, off) => {
      const g = new THREE.Group();
      const A = a.clone().add(off), B = b.clone().add(off);
      const mat = new THREE.LineBasicMaterial({ color: 0x14161a, depthTest: false, transparent: true });
      const line = (p1, p2) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), mat);
      g.add(line(A, B), line(a, A), line(b, B));
      const sp2 = textSprite(label);
      sp2.position.copy(A.clone().add(B).multiplyScalar(0.5));
      g.add(sp2);
      g.renderOrder = 998;
      root.add(g);
    };
    const L = cfg.length, S = cfg.span, H = cfg.wallHeight;
    dim(V(-L / 2, 0.02, S / 2), V(L / 2, 0.02, S / 2), `${L.toFixed(2)} m length`, V(0, 0, 2.2));
    dim(V(L / 2, 0.02, -S / 2), V(L / 2, 0.02, S / 2), `${S.toFixed(2)} m span`, V(2.2, 0, 0));
    dim(V(highEndX(cfg), 0, S / 2), V(highEndX(cfg), H, S / 2), `${H.toFixed(2)} m wall`, V(-lowSign(cfg) * 1.0, 0, 1.0));
    if (cfg.split.enabled) {
      const sx = splitX(cfg);
      dim(V(sx, 0, -S / 2), V(sx, -drop, -S / 2), `${drop.toFixed(2)} m step`, V(0, 0, -1.2));
      dim(V(lowEndX(cfg), -drop, -S / 2), V(sx, -drop, -S / 2), `${cfg.split.backLen.toFixed(2)} m lower`, V(0, 0, -2.4));
      dim(V(lowEndX(cfg), -drop, 0), V(lowEndX(cfg), backInternal(cfg).lo - drop, 0),
        `${backInternal(cfg).lo.toFixed(2)} m internal`, V(lowSign(cfg) * 1.6, 0, 0));
      // natural surface line along the centre for reference
      const pts = [];
      for (let i = 0; i <= 80; i++) {
        const x = -L / 2 - 6 + (i / 80) * (L + 12);
        pts.push(new THREE.Vector3(x, naturalY(cfg, x), -S / 2 - 3.2));
      }
      const nl = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({ color: 0x8b4513, dashSize: 0.3, gapSize: 0.2, depthTest: false })
      );
      nl.computeLineDistances();
      root.add(nl);
      const nlb = textSprite("natural surface");
      nlb.position.set(-L / 2 - 4, naturalY(cfg, -L / 2 - 4) + 0.5, -S / 2 - 3.2);
      root.add(nlb);
    }
    const bay = bayOf(cfg);
    for (let k = 0; k < cfg.bays; k++)
      dim(V(-L / 2 + k * bay, 0.02, -S / 2), V(-L / 2 + (k + 1) * bay, 0.02, -S / 2), `${bay.toFixed(2)}`, V(0, 0, -1.0));
  }

  return root;
}

/* ============================================================================
   Viewport
============================================================================ */
function Viewport({ cfg, viewKey, shotKey }) {
  const mount = useRef(null);
  const st = useRef({});

  useEffect(() => {
    const el = mount.current;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.outputEncoding = THREE.sRGBEncoding;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = skyTexture();
    scene.fog = new THREE.Fog(0xc9d6de, 55, 190);
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 600);

    scene.add(new THREE.HemisphereLight(0xbcd7ef, 0x5b6b3f, 0.9));
    const sun = new THREE.DirectionalLight(0xfff4e2, 1.3);
    sun.position.set(-24, 28, 18);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const d = 30;
    Object.assign(sun.shadow.camera, { left: -d, right: d, top: d, bottom: -d, near: 1, far: 100 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0009;
    scene.add(sun);

    const orbit = { r: 30, theta: Math.PI * 0.72, phi: Math.PI * 0.36, target: new THREE.Vector3(0, 1.2, 0) };
    const sync = () => {
      const { r, theta, phi, target } = orbit;
      camera.position.set(
        target.x + r * Math.sin(phi) * Math.sin(theta),
        target.y + r * Math.cos(phi),
        target.z + r * Math.sin(phi) * Math.cos(theta)
      );
      camera.lookAt(target);
    };
    sync();

    let drag = null;
    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    dom.style.cursor = "grab";
    const down = (e) => { drag = { x: e.clientX, y: e.clientY, pan: e.button === 2 || e.shiftKey }; dom.setPointerCapture(e.pointerId); dom.style.cursor = "grabbing"; };
    const move = (e) => {
      if (!drag) return;
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      drag.x = e.clientX; drag.y = e.clientY;
      if (drag.pan) {
        const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
        const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
        const k = orbit.r * 0.0016;
        orbit.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
      } else {
        orbit.theta -= dx * 0.006;
        orbit.phi = Math.max(0.08, Math.min(Math.PI / 2 + 0.25, orbit.phi - dy * 0.005));
      }
      sync();
    };
    const up = () => { drag = null; dom.style.cursor = "grab"; };
    const wheel = (e) => { e.preventDefault(); orbit.r = Math.max(3, Math.min(160, orbit.r * Math.exp(e.deltaY * 0.0012))); sync(); };
    dom.addEventListener("pointerdown", down);
    dom.addEventListener("pointermove", move);
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    dom.addEventListener("wheel", wheel, { passive: false });
    dom.addEventListener("contextmenu", (e) => e.preventDefault());

    let raf;
    const loop = () => { renderer.render(scene, camera); raf = requestAnimationFrame(loop); };
    loop();

    const ro = new ResizeObserver(() => {
      if (!el.clientWidth) return;
      renderer.setSize(el.clientWidth, el.clientHeight);
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
    });
    ro.observe(el);
    st.current = { scene, camera, renderer, orbit, sync, shed: null };
    return () => {
      cancelAnimationFrame(raf); ro.disconnect();
      dom.removeEventListener("pointerdown", down);
      dom.removeEventListener("pointermove", move);
      dom.removeEventListener("pointerup", up);
      dom.removeEventListener("wheel", wheel);
      renderer.dispose(); el.removeChild(dom);
    };
  }, []);

  useEffect(() => {
    const s = st.current;
    if (!s.scene) return;
    if (s.shed) {
      s.scene.remove(s.shed);
      s.shed.traverse((o) => {
        if (o.geometry) o.geometry.dispose();
        if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
          if (m.map) m.map.dispose();
          m.dispose();
        });
      });
    }
    s.shed = buildShed(cfg);
    s.scene.add(s.shed);
  }, [JSON.stringify(cfg)]);

  useEffect(() => {
    const s = st.current;
    if (!s.orbit || !viewKey) return;
    const k = viewKey.split("|")[0];
    const R = Math.max(cfg.length, cfg.span) * 2.0;
    const set = (theta, phi, r, ty) => {
      Object.assign(s.orbit, { theta, phi, r });
      s.orbit.target.set(0, ty !== undefined ? ty : cfg.wallHeight * 0.4, 0);
      s.sync();
    };
    if (k === "iso") set(Math.PI * 0.72, Math.PI * 0.36, R);
    if (k === "front") set(0, Math.PI / 2 - 0.02, R * 1.05);
    if (k === "back") set(Math.PI, Math.PI / 2 - 0.02, R * 1.05);
    if (k === "left") set(-Math.PI / 2, Math.PI / 2 - 0.02, R * 1.05);
    if (k === "right") set(Math.PI / 2, Math.PI / 2 - 0.02, R * 1.05);
    if (k === "plan") set(0, 0.05, R * 1.1);
    if (k === "section") set(Math.PI, Math.PI / 2 - 0.06, R * 0.95, 0.4);
  }, [viewKey]);

  useEffect(() => {
    if (!shotKey) return;
    const s = st.current;
    if (!s.renderer) return;
    s.renderer.render(s.scene, s.camera);
    const a = document.createElement("a");
    a.href = s.renderer.domElement.toDataURL("image/png");
    a.download = `shed-${cfg.length}x${cfg.span}.png`;
    a.click();
  }, [shotKey]);

  return <div ref={mount} className="absolute inset-0" />;
}

/* ============================================================================
   UI atoms
============================================================================ */
const Num = ({ label, value, onChange, min, max, step = 0.1, unit = "m" }) => (
  <label className="flex items-center justify-between gap-2 py-1">
    <span className="text-[11px] uppercase tracking-wider text-zinc-400">{label}</span>
    <span className="flex items-center gap-1">
      <input type="number" value={value} min={min} max={max} step={step}
        onChange={(e) => { const v = parseFloat(e.target.value); if (!isNaN(v)) onChange(Math.max(min, Math.min(max, v))); }}
        className="w-20 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-right font-mono text-xs text-zinc-100 focus:border-amber-500 focus:outline-none" />
      <span className="w-5 text-[10px] text-zinc-500">{unit}</span>
    </span>
  </label>
);
const Slide = ({ label, value, onChange, min, max, step, fmt }) => (
  <div className="py-1">
    <div className="flex justify-between text-[11px] uppercase tracking-wider text-zinc-400">
      <span>{label}</span><span className="font-mono text-zinc-200">{fmt ? fmt(value) : value}</span>
    </div>
    <input type="range" min={min} max={max} step={step} value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))} className="w-full accent-amber-500" />
  </div>
);
const Section = ({ title, children, right }) => (
  <div className="border-b border-zinc-800">
    <div className="flex items-center justify-between px-3 pt-3 pb-1">
      <h3 className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-500">{title}</h3>
      {right}
    </div>
    <div className="px-3 pb-3">{children}</div>
  </div>
);
const Seg = ({ options, value, onChange }) => (
  <div className="flex overflow-hidden rounded border border-zinc-700">
    {options.map(([v, l]) => (
      <button key={v} onClick={() => onChange(v)}
        className={`flex-1 px-2 py-1 text-[11px] transition ${value === v ? "bg-amber-500 font-semibold text-zinc-950" : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
        {l}
      </button>
    ))}
  </div>
);
const Check = ({ label, checked, onChange }) => (
  <label className="flex items-center gap-2 py-1 text-[12px] text-zinc-300">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="accent-amber-500" />
    {label}
  </label>
);

/* ============================================================================
   App
============================================================================ */
export default function ShedConfigurator() {
  const [cfg, setCfg] = useState(DEFAULTS);
  const [tab, setTab] = useState("split");
  const [viewKey, setViewKey] = useState("iso|0");
  const [shotKey, setShotKey] = useState(0);
  const [picker, setPicker] = useState(null);
  const [panelOpen, setPanelOpen] = useState(true);
  const [filter, setFilter] = useState("all");
  const nextId = useRef(100);

  /** Apply one fix. */
  const applyFix = (fix) => setCfg((c) => fix.apply(c) || c);
  /** Apply fixes repeatedly until the errors stop resolving. Each pass re-validates,
   *  so a fix that exposes the next problem gets picked up rather than being lost. */
  const fixAll = (sevs) =>
    setCfg((c) => {
      let cur = c;
      for (let pass = 0; pass < 20; pass++) {
        const next = validate(cur).find((i) => sevs.includes(i.sev) && i.fix);
        if (!next) break;
        const after = next.fix.apply(cur);
        if (!after || JSON.stringify(after) === JSON.stringify(cur)) break;
        cur = after;
      }
      return cur;
    });

  const set = (patch) => setCfg((c) => ({ ...c, ...patch }));
  const setIn = (key, patch) => setCfg((c) => ({ ...c, [key]: { ...c[key], ...patch } }));
  const setShow = (k, v) => setIn("show", { [k]: v });
  const setOpening = (id, patch) => setCfg((c) => ({ ...c, openings: c.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)) }));

  const issues = useMemo(() => validate(cfg), [cfg]);
  const errs = issues.filter((i) => i.sev === "err");
  const warns = issues.filter((i) => i.sev === "warn");
  const notes = issues.filter((i) => i.sev === "note");
  const ew = useMemo(() => (cfg.split.enabled ? earthworks(cfg) : null), [JSON.stringify(cfg.split), JSON.stringify(cfg.terrain), cfg.length, cfg.span]);

  const addOpening = (type) => {
    const o = { id: nextId.current++, wall: type === "roller" ? "right" : "front", type, ...OPENING_PRESETS[type], offset: 0.6 };
    o.offset = snapToBay(cfg, o);
    setCfg((c) => ({ ...c, openings: [...c.openings, o] }));
  };
  const view = (k) => setViewKey(`${k}|${Date.now()}`);

  const drop = dropOf(cfg);

  return (
    <div className="flex h-screen w-full bg-zinc-950 font-sans text-zinc-200">
      <aside className="flex w-[352px] shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
        <div className="border-b border-zinc-800 px-3 py-3">
          <div className="text-sm font-semibold tracking-tight text-zinc-100">Split-level Shed Configurator</div>
          <div className="mt-1 font-mono text-[11px] leading-relaxed text-zinc-500">
            {cfg.length.toFixed(1)} × {cfg.span.toFixed(1)} m · {cfg.bays} bays @ {bayOf(cfg).toFixed(2)} m
            {cfg.split.enabled && (
              <>
                <br />
                upper {((cfg.length - cfg.split.backLen) * cfg.span).toFixed(1)} m² @ RL 0 · lower{" "}
                {(cfg.split.backLen * cfg.span).toFixed(1)} m² @ RL −{drop.toFixed(2)}
                <br />
                internal height back {backInternal(cfg).lo.toFixed(2)}–{backInternal(cfg).hi.toFixed(2)} m
                {ew && <><br />cut ≈ {Math.round(ew.cut)} m³ · fill ≈ {Math.round(ew.fill)} m³</>}
              </>
            )}
          </div>
        </div>

        <nav className="flex border-b border-zinc-800 text-[10px]">
          {[["size", "Size"], ["split", "Split"], ["fitout", "Fit-out"], ["openings", "Openings"], ["colours", "Colour"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2 uppercase tracking-wider transition ${tab === k ? "border-b-2 border-amber-500 bg-zinc-950 text-amber-500" : "text-zinc-500 hover:text-zinc-300"}`}>
              {l}
            </button>
          ))}
        </nav>

        <div className="flex-1 overflow-y-auto">
          {tab === "size" && (
            <>
              <Section title="Building">
                <Num label="Span (width)" value={cfg.span} min={3} max={30} onChange={(v) => set({ span: v })} />
                <Num label="Length" value={cfg.length} min={4} max={60} onChange={(v) => set({ length: v })} />
                <Num label="Wall height" value={cfg.wallHeight} min={2.1} max={9} onChange={(v) => set({ wallHeight: v })} />
              </Section>
              <Section title="Roof">
                <Seg options={[["gable", "Gable"], ["skillion", "Skillion"]]} value={cfg.roofType}
                  onChange={(v) => set({ roofType: v, pitch: v === "gable" ? 11 : 6 })} />
                {cfg.roofType === "skillion" && (
                  <div className="mt-2">
                    <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Falls toward</div>
                    <div className="grid grid-cols-2 gap-1">
                      {[["front", "Front side"], ["back", "Back side"], ["left", "Left end"], ["right", "Right end"]].map(([v, l]) => (
                        <button key={v} onClick={() => set({ skillionLow: v })}
                          className={`rounded border px-2 py-1 text-[11px] transition ${
                            cfg.skillionLow === v
                              ? "border-amber-500 bg-amber-500 font-semibold text-zinc-950"
                              : "border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700"}`}>
                          {l}
                        </button>
                      ))}
                    </div>
                    <div className="mt-1.5 font-mono text-[11px] leading-relaxed text-zinc-500">
                      falls across {skillionRun(cfg).toFixed(2)} m · rise {(skillionRun(cfg) * Math.tan(D(cfg.pitch))).toFixed(2)} m
                      <br />low wall {cfg.wallHeight.toFixed(2)} m · high wall {ridgeHeight(cfg).toFixed(2)} m
                      {skillionAlongX(cfg) && cfg.split.enabled && (
                        <span className="mt-0.5 block text-zinc-600">
                          Falling along the length: the roof {cfg.skillionLow === cfg.split.lowEnd ? "drops with the slab, so the lower section keeps a normal ceiling" : "rises over the lower section, stacking the fall on top of the step"}.
                        </span>
                      )}
                    </div>
                  </div>
                )}
                <div className="mt-2">
                  <Slide label="Pitch" value={cfg.pitch} min={2} max={30} step={0.5} onChange={(v) => set({ pitch: v })} fmt={(v) => `${v}°`} />
                  <div className="font-mono text-[11px] text-zinc-500">Ridge {ridgeHeight(cfg).toFixed(2)} m above the upper slab</div>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <Num label="Eave o'hang" value={cfg.eaveOverhang} min={0} max={1} step={0.05} onChange={(v) => set({ eaveOverhang: v })} />
                  <Num label="Gable o'hang" value={cfg.gableOverhang} min={0} max={1} step={0.05} onChange={(v) => set({ gableOverhang: v })} />
                </div>
              </Section>
              <Section title="Bays">
                <Slide label="Portal frames" value={cfg.bays} min={1} max={16} step={1} onChange={(v) => set({ bays: v })}
                  fmt={(v) => `${v} bays · ${(cfg.length / v).toFixed(2)} m`} />
                <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                  End posts at <span className="font-mono text-zinc-400">{endSpacingOf(cfg).toFixed(2)} m</span>. The step wants to land on a bay line.
                </p>
              </Section>
              <Section title="View">
                {[["dims", "Dimensions & natural surface"], ["labels", "Room labels"], ["grid", "Bay grid overlay"],
                  ["slab", "Slabs & step"], ["retaining", "Retaining walls"], ["ground", "Terrain & sky"],
                  ["section", "Cut away front wall"]].map(([k, l]) => (
                  <Check key={k} label={l} checked={cfg.show[k]} onChange={(v) => setShow(k, v)} />
                ))}
              </Section>
            </>
          )}

          {tab === "split" && (
            <>
              <Section title="Split level">
                <Check label="Split-level slab" checked={cfg.split.enabled} onChange={(v) => setIn("split", { enabled: v })} />
                {cfg.split.enabled && (
                  <>
                    <div className="my-2">
                      <Seg options={[["left", "Low end: left"], ["right", "Low end: right"]]} value={cfg.split.lowEnd}
                        onChange={(v) => setIn("split", { lowEnd: v })} />
                    </div>
                    <Num label="Lower section length" value={cfg.split.backLen} min={2} max={cfg.length - 3} onChange={(v) => setIn("split", { backLen: v })} />
                    <Num label="Slab drop" value={cfg.split.drop} min={0.2} max={3.5} step={0.05} onChange={(v) => setIn("split", { drop: v })} />
                    <button
                      onClick={() => {
                        const bay = bayOf(cfg);
                        const k = Math.max(1, Math.min(cfg.bays - 1, Math.round((splitX(cfg) + cfg.length / 2) / bay)));
                        const nx = -cfg.length / 2 + k * bay;
                        setIn("split", {
                          backLen: +(cfg.split.lowEnd === "left" ? nx + cfg.length / 2 : cfg.length / 2 - nx).toFixed(3),
                        });
                      }}
                      className="mt-1 w-full rounded border border-zinc-700 py-1 text-[11px] text-zinc-400 hover:border-amber-500 hover:text-amber-400">
                      Snap the step to the nearest portal frame
                    </button>
                    <div className="mt-2 font-mono text-[11px] leading-relaxed text-zinc-500">
                      step at x = {splitX(cfg).toFixed(2)} m · lower slab RL −{drop.toFixed(2)}
                      <br />internal height back {backInternal(cfg).lo.toFixed(2)}–{backInternal(cfg).hi.toFixed(2)} m
                      <br />retained max {retainStats(cfg).max.toFixed(2)} m
                    </div>
                  </>
                )}
              </Section>
              <Section title="Site & earthworks">
                <Slide label="Ground fall toward the low end" value={cfg.terrain.grade} min={0} max={45} step={1}
                  onChange={(v) => setIn("terrain", { grade: v })} fmt={(v) => `${v}% · 1:${(100 / (v || 1)).toFixed(1)}`} />
                <Num label="Crest offset from step" value={cfg.terrain.crestOffset} min={-10} max={20} step={0.5} onChange={(v) => setIn("terrain", { crestOffset: v })} />
                <Num label="Working margin" value={cfg.terrain.margin} min={0.3} max={4} step={0.1} onChange={(v) => setIn("terrain", { margin: v })} />
                <div className="grid grid-cols-2 gap-2">
                  <Num label="Cut batter 1:" value={cfg.terrain.cutBatter} min={0.3} max={4} step={0.1} unit="" onChange={(v) => setIn("terrain", { cutBatter: v })} />
                  <Num label="Fill batter 1:" value={cfg.terrain.fillBatter} min={1} max={5} step={0.1} unit="" onChange={(v) => setIn("terrain", { fillBatter: v })} />
                </div>
                {ew && (
                  <div className="mt-2 rounded border border-zinc-800 bg-zinc-950 p-2 font-mono text-[11px] leading-relaxed text-zinc-400">
                    cut {Math.round(ew.cut)} m³ · deepest {ew.maxCut.toFixed(2)} m
                    <br />fill {Math.round(ew.fill)} m³ · deepest {ew.maxFill.toFixed(2)} m
                    <br />net {Math.round(ew.cut - ew.fill) > 0 ? "export" : "import"} ≈ {Math.abs(Math.round(ew.cut - ew.fill))} m³
                    <span className="mt-1 block text-zinc-600">Surface model only. No topsoil strip, no bulking, no over-excavation.</span>
                  </div>
                )}
              </Section>
            </>
          )}

          {tab === "fitout" && (
            <>
              <Section title="Lower level fit-out">
                <Check label="Fit out the lower level" checked={cfg.fitout.enabled}
                  onChange={(v) => setIn("fitout", { enabled: v })} />
                {!cfg.split.enabled && <p className="mt-1 text-[11px] text-zinc-500">Turn on the split level first.</p>}
                {cfg.fitout.enabled && cfg.split.enabled && (
                  <>
                    <Num label="Gym length" value={cfg.fitout.gymLen} min={1} max={Math.max(1, cfg.split.backLen - 2.5)} onChange={(v) => setIn("fitout", { gymLen: v })} />
                    <Num label="Ceiling height" value={cfg.fitout.ceiling} min={2.1} max={+(backInternal(cfg).lo - 0.2).toFixed(2)} step={0.05} onChange={(v) => setIn("fitout", { ceiling: v })} />
                    <Check label="Ceiling over the flat" checked={cfg.fitout.ceilingPanel} onChange={(v) => setIn("fitout", { ceilingPanel: v })} />
                    <div className="mt-2 font-mono text-[11px] text-zinc-500">
                      gym {(cfg.fitout.gymLen * cfg.span).toFixed(1)} m² · flat{" "}
                      {((cfg.split.backLen - cfg.fitout.gymLen) * cfg.span - cfg.fitout.bath.width * cfg.fitout.bath.depth).toFixed(1)} m²
                      <br />void above the flat ceiling {(backInternal(cfg).lo - cfg.fitout.ceiling).toFixed(2)} m at the low eave
                    </div>
                  </>
                )}
              </Section>
              {cfg.fitout.enabled && cfg.split.enabled && (
                <>
                  <Section title="Bathroom">
                    <Seg options={[["front", "Front corner"], ["back", "Back corner"]]} value={cfg.fitout.bath.side}
                      onChange={(v) => setIn("fitout", { bath: { ...cfg.fitout.bath, side: v } })} />
                    <div className="mt-2">
                      <Num label="Width (along span)" value={cfg.fitout.bath.width} min={1.2} max={cfg.span - 1} onChange={(v) => setIn("fitout", { bath: { ...cfg.fitout.bath, width: v } })} />
                      <Num label="Depth (along length)" value={cfg.fitout.bath.depth} min={1.2} max={4} onChange={(v) => setIn("fitout", { bath: { ...cfg.fitout.bath, depth: v } })} />
                    </div>
                    <p className="mt-1 text-[11px] leading-snug text-zinc-500">
                      {(cfg.fitout.bath.width * cfg.fitout.bath.depth).toFixed(1)} m². A toilet, basin and 900 shower wants about 2.0 × 2.4 m minimum.
                    </p>
                  </Section>
                  <Section title="Stair">
                    <Seg options={[["front", "Against front wall"], ["back", "Against back wall"]]} value={cfg.fitout.stairs.side}
                      onChange={(v) => setIn("fitout", { stairs: { ...cfg.fitout.stairs, side: v } })} />
                    <div className="mt-2">
                      <Num label="Width" value={cfg.fitout.stairs.width} min={0.8} max={2} onChange={(v) => setIn("fitout", { stairs: { ...cfg.fitout.stairs, width: v } })} />
                      <Num label="Offset from wall" value={cfg.fitout.stairs.offset} min={0} max={3} onChange={(v) => setIn("fitout", { stairs: { ...cfg.fitout.stairs, offset: v } })} />
                    </div>
                    <div className="mt-1 font-mono text-[11px] text-zinc-500">
                      {Math.ceil(drop / 0.19)} risers @ {((drop / Math.ceil(drop / 0.19)) * 1000).toFixed(0)} mm ·{" "}
                      {(Math.ceil(drop / 0.19) * 0.25).toFixed(2)} m run
                    </div>
                  </Section>
                </>
              )}
            </>
          )}

          {tab === "openings" && (
            <Section title="Openings" right={
              <div className="flex gap-1">
                {[["roller", "+ Roller"], ["pa", "+ PA"], ["window", "+ Window"]].map(([t, l]) => (
                  <button key={t} onClick={() => addOpening(t)}
                    className="rounded border border-zinc-700 bg-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-amber-500 hover:text-amber-400">{l}</button>
                ))}
              </div>
            }>
              <div className="space-y-2">
                {cfg.openings.map((o, i) => {
                  const bad = issues.some((x) => x.id === o.id && x.sev === "err");
                  const prof = profileFor(cfg, o.wall);
                  const wx = worldAtU(cfg, o.wall, o.offset + o.width / 2).x;
                  const level = isLowX(cfg, wx) ? "lower" : "upper";
                  return (
                    <div key={o.id} className={`rounded border p-2 ${bad ? "border-red-600/70 bg-red-950/20" : "border-zinc-700 bg-zinc-800/40"}`}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="font-mono text-[11px] text-zinc-300">
                          {TYPE_LABEL[o.type]} {i + 1}
                          <span className="ml-1 rounded bg-zinc-700 px-1 text-[9px] uppercase text-zinc-300">{level}</span>
                        </span>
                        <div className="flex gap-1">
                          <button onClick={() => setOpening(o.id, { offset: snapToBay(cfg, o) })}
                            className="rounded border border-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-amber-500 hover:text-amber-400">Centre in bay</button>
                          <button onClick={() => setCfg((c) => ({ ...c, openings: c.openings.filter((x) => x.id !== o.id) }))}
                            className="rounded border border-zinc-600 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-red-500 hover:text-red-400">Remove</button>
                        </div>
                      </div>
                      <select value={o.wall} onChange={(e) => setOpening(o.id, { wall: e.target.value })}
                        className="mb-1 w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-[11px] text-zinc-200">
                        {WALLS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                      <Num label="Width" value={o.width} min={0.4} max={14} onChange={(v) => setOpening(o.id, { width: v })} />
                      <Num label="Height" value={o.height} min={0.4} max={8} onChange={(v) => setOpening(o.id, { height: v })} />
                      <Num label="Offset from corner" value={o.offset} min={0} max={prof.w} onChange={(v) => setOpening(o.id, { offset: v })} />
                      {o.type !== "roller" && <Num label="Sill above its slab" value={o.sill} min={0} max={4} onChange={(v) => setOpening(o.id, { sill: v })} />}
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-zinc-500">
                Offset runs from the left corner viewed from outside. Sills are measured from whichever slab that opening sits over.
              </p>
            </Section>
          )}

          {tab === "colours" && (
            <Section title="Colorbond finish">
              {ELEMENTS.map(([k, l]) => (
                <button key={k} onClick={() => setPicker(picker === k ? null : k)}
                  className={`mb-1 flex w-full items-center gap-2 rounded border px-2 py-1.5 text-left transition ${picker === k ? "border-amber-500 bg-zinc-800" : "border-zinc-700 bg-zinc-800/40 hover:border-zinc-600"}`}>
                  <span className="h-6 w-6 shrink-0 rounded border border-zinc-600" style={{ background: hexOf(cfg.colours[k]) }} />
                  <span className="flex-1">
                    <span className="block text-[10px] uppercase tracking-wider text-zinc-500">{l}</span>
                    <span className="block font-mono text-[12px] text-zinc-200">{cfg.colours[k]}</span>
                  </span>
                </button>
              ))}
              {picker && (
                <div className="mt-2 rounded border border-zinc-700 bg-zinc-950 p-2">
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-zinc-500">Standard colours</div>
                  <div className="grid grid-cols-6 gap-1">
                    {PALETTE.map((p) => (
                      <button key={p.n} title={p.n}
                        onClick={() => setIn("colours", { [picker]: p.n })}
                        className={`aspect-square rounded border-2 ${cfg.colours[picker] === p.n ? "border-amber-500" : "border-zinc-700 hover:border-zinc-500"}`}
                        style={{ background: p.h }} />
                    ))}
                  </div>
                  <button onClick={() => setCfg((c) => ({ ...c, colours: Object.fromEntries(ELEMENTS.map(([k]) => [k, c.colours[picker]])) }))}
                    className="mt-2 w-full rounded border border-zinc-700 py-1 text-[11px] text-zinc-400 hover:border-amber-500 hover:text-amber-400">
                    Apply {cfg.colours[picker]} to everything
                  </button>
                </div>
              )}
              <p className="mt-2 text-[11px] leading-snug text-zinc-500">Screen approximations, not colour-matched.</p>
            </Section>
          )}
        </div>

        <div className="border-t border-zinc-800 p-2">
          <div className="grid grid-cols-4 gap-1">
            {[["iso", "3D"], ["front", "Front"], ["back", "Back"], ["left", "Left"], ["right", "Right"], ["plan", "Plan"], ["section", "Section"]].map(([k, l]) => (
              <button key={k} onClick={() => { if (k === "section") setShow("section", true); view(k); }}
                className="rounded border border-zinc-700 bg-zinc-800 py-1 text-[11px] text-zinc-300 hover:border-amber-500 hover:text-amber-400">{l}</button>
            ))}
          </div>
          <div className="mt-1 grid grid-cols-2 gap-1">
            <button onClick={() => setShotKey(Date.now())} className="rounded bg-amber-500 py-1.5 text-[11px] font-semibold text-zinc-950 hover:bg-amber-400">Save screenshot</button>
            <button onClick={() => {
              const b = new Blob([JSON.stringify(cfg, null, 2)], { type: "application/json" });
              const a = document.createElement("a");
              a.href = URL.createObjectURL(b);
              a.download = "shed-config.json";
              a.click();
            }} className="rounded border border-zinc-700 bg-zinc-800 py-1.5 text-[11px] text-zinc-300 hover:border-amber-500 hover:text-amber-400">Export config</button>
          </div>
        </div>
      </aside>

      <main className="relative flex-1">
        <Viewport cfg={cfg} viewKey={viewKey} shotKey={shotKey} />
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-zinc-950/70 px-2 py-1 font-mono text-[10px] text-zinc-400 backdrop-blur">
          drag orbit · shift-drag pan · scroll zoom
        </div>
        {!panelOpen && (
          <button onClick={() => setPanelOpen(true)}
            className="absolute bottom-3 left-3 flex items-center gap-2.5 rounded border border-zinc-700 bg-zinc-950/85 px-2.5 py-1.5 backdrop-blur hover:border-zinc-500">
            <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Checks</span>
            <span className={`font-mono text-[11px] ${errs.length ? "text-red-400" : "text-emerald-400"}`}>{errs.length}</span>
            <span className="font-mono text-[11px] text-amber-400">{warns.length}</span>
            <span className="font-mono text-[11px] text-sky-400">{notes.length}</span>
            <span className="text-[10px] text-zinc-500">▲</span>
          </button>
        )}

        {panelOpen && (
          <div className="absolute bottom-3 left-3 flex max-h-[46vh] w-[520px] max-w-[calc(100%-1.5rem)] flex-col rounded border border-zinc-800 bg-zinc-950/90 backdrop-blur">
            <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-1.5">
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-zinc-500">Checks</span>
              {[["err", errs.length, "text-red-400", "clash"], ["warn", warns.length, "text-amber-400", "review"], ["note", notes.length, "text-sky-400", "note"]].map(([k, n, cls]) => (
                <button key={k} onClick={() => setFilter(filter === k ? "all" : k)}
                  className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${cls} ${filter === k ? "bg-zinc-800 ring-1 ring-zinc-600" : "hover:bg-zinc-900"}`}>
                  {n}
                </button>
              ))}
              <div className="flex-1" />
              {errs.some((e) => e.fix) && (
                <button onClick={() => fixAll(["err"])}
                  className="rounded bg-amber-500 px-2 py-0.5 text-[10px] font-semibold text-zinc-950 hover:bg-amber-400">
                  Fix all clashes
                </button>
              )}
              {!errs.some((e) => e.fix) && warns.some((w) => w.fix) && (
                <button onClick={() => fixAll(["err", "warn"])}
                  className="rounded border border-zinc-700 px-2 py-0.5 text-[10px] text-zinc-300 hover:border-amber-500 hover:text-amber-400">
                  Fix all warnings
                </button>
              )}
              <button onClick={() => setPanelOpen(false)}
                className="rounded px-1.5 py-0.5 text-[10px] text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300">▼</button>
            </div>
            <ul className="divide-y divide-zinc-900 overflow-y-auto">
              {[...errs, ...warns, ...notes]
                .filter((it) => filter === "all" || it.sev === filter)
                .map((it, i) => (
                  <li key={i} className="flex items-start gap-2 px-3 py-1.5 text-[11.5px] leading-snug">
                    <span className={`mt-[4px] h-1.5 w-1.5 shrink-0 rounded-full ${it.sev === "err" ? "bg-red-500" : it.sev === "warn" ? "bg-amber-500" : "bg-sky-500"}`} />
                    <span className={`flex-1 ${it.sev === "err" ? "text-red-200" : it.sev === "warn" ? "text-amber-100/80" : "text-sky-100/70"}`}>
                      {it.msg}
                    </span>
                    {it.fix && (
                      <button onClick={() => applyFix(it.fix)} title={it.fix.label}
                        className="mt-[1px] shrink-0 rounded border border-zinc-700 bg-zinc-900 px-1.5 py-0.5 text-[10px] text-zinc-300 hover:border-amber-500 hover:bg-zinc-800 hover:text-amber-400">
                        {it.fix.label}
                      </button>
                    )}
                  </li>
                ))}
              {![...errs, ...warns, ...notes].filter((it) => filter === "all" || it.sev === filter).length && (
                <li className="px-3 py-2 text-[11.5px] text-zinc-500">Nothing here.</li>
              )}
            </ul>
          </div>
        )}
      </main>
    </div>
  );
}
