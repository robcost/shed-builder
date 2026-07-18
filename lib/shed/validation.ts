/**
 * Placement solver and validation engine — ported verbatim from the prototype
 * (`shed-configurator-v2.jsx`). `validate` returns a list of issues, each with
 * an optional one-tap `fix`. Behaviour is unchanged; only types were added.
 */
import { COL_HALF, MIN_H, TYPE_LABEL } from "@/lib/shed/constants";
import {
  backInternal,
  baseAt,
  bayOf,
  earthworks,
  isLowX,
  isSideWall,
  lowEndX,
  naturalY,
  profileFor,
  retainStats,
  spacingFor,
  splitX,
  topAt,
  uOfX,
  wallBasis,
  worldAtU,
} from "@/lib/shed/geometry";
import type { Fix, Issue, Opening, Severity, ShedConfig } from "@/types/shed";

/** The slab level an opening sits over. */
type Level = "lower" | "upper";

/** Return a copy of `cfg` with `patch` applied to the opening with id `id`. */
export const patchOpening = (
  cfg: ShedConfig,
  id: number,
  patch: Partial<Opening>,
): ShedConfig => ({
  ...cfg,
  openings: cfg.openings.map((o) => (o.id === id ? { ...o, ...patch } : o)),
});

/** Every bay on this wall that could legally hold `o`, centred. */
export function bayCandidates(
  cfg: ShedConfig,
  o: Opening,
  level?: Level | null,
): number[] {
  const prof = profileFor(cfg, o.wall);
  const sp = spacingFor(cfg, o.wall);
  const n = Math.round(prof.w / sp);
  const res: number[] = [];
  if (o.width > sp - 2 * COL_HALF - 0.02) return res;
  for (let k = 0; k < n; k++) {
    const off = +(k * sp + (sp - o.width) / 2).toFixed(3);
    if (off < 0.1 || off + o.width > prof.w - 0.1) continue;
    const xm = worldAtU(cfg, o.wall, off + o.width / 2).x;
    if (level && (isLowX(cfg, xm) ? "lower" : "upper") !== level) continue;
    if (cfg.split.enabled && isSideWall(o.wall)) {
      const us = uOfX(cfg, o.wall, splitX(cfg) as number);
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
export function nearestFreeBay(
  cfg: ShedConfig,
  o: Opening,
  level?: Level | null,
): number | null {
  const c = bayCandidates(cfg, o, level);
  if (!c.length) return null;
  const mid = o.offset + o.width / 2;
  return c.reduce((best, off) =>
    Math.abs(off + o.width / 2 - mid) < Math.abs(best + o.width / 2 - mid) ? off : best);
}

/** Validate a configuration, returning issues with optional one-tap fixes. */
export function validate(cfg: ShedConfig): Issue[] {
  const out: Issue[] = [];
  const push = (id: number, sev: Severity, msg: string, fix?: Fix | null) =>
    out.push({ id, sev, msg, ...(fix ? { fix } : {}) });
  /** fix = { label, apply(cfg) -> cfg | null } */
  const reBay = (o: Opening, label: string, level?: Level | null): Fix | null => {
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
      const us = uOfX(cfg, o.wall, splitX(cfg) as number);
      if (a < us - 0.05 && b > us + 0.05) {
        // keep it on whichever level it mostly sits over
        const lvlU = Math.max(0, Math.min(W, us));
        const lower = (o.wall === "front") === (cfg.split.lowEnd === "left");
        const overLow = lower ? lvlU - a : b - lvlU;
        const target: Level = overLow > o.width / 2 ? "lower" : "upper";
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
      const fix: Fix | null = isSideWall(o.wall)
        ? (() => {
            const nb = Math.floor(cfg.length / (o.width + 2 * COL_HALF + 0.04));
            return nb >= 1 && nb < cfg.bays
              ? { label: `Widen the bays: ${nb} frames @ ${(cfg.length / nb).toFixed(2)} m`, apply: (c: ShedConfig) => ({ ...c, bays: nb }) }
              : null;
          })()
        : { label: `Narrow it to ${(clear - 0.02).toFixed(2)} m`, apply: (c) => patchOpening(c, o.id, { width: +(clear - 0.02).toFixed(2) }) };
      push(o.id, "err", `${label}: ${o.width.toFixed(2)} m will not fit a ${sp.toFixed(2)} m bay (${clear.toFixed(2)} m clear).`, fix);
    }

    if (o.sill + o.height > headroom - 0.15) {
      const newH = +(headroom - 0.15 - o.sill).toFixed(2);
      let fix: Fix;
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
      const wp = worldAtU(cfg, o.wall, a + o.width / 2);
      const nat = naturalY(cfg, wp.x, wp.z);
      const sillY = bm + o.sill, headY = sillY + o.height;
      const raise: Fix = { label: `Raise the sill to ${(nat - bm + 0.1).toFixed(2)} m, clear of the ground`,
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
    const sxU = splitX(cfg) as number;
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

    let cutAtStep = -Infinity;
    for (let z = -cfg.span / 2; z <= cfg.span / 2 + 1e-9; z += cfg.span / 4)
      cutAtStep = Math.max(cutAtStep, naturalY(cfg, sxU, z) + cfg.split.drop);
    if (cutAtStep > 0) push(0, "note", `Deepest cut at the step line is ${cutAtStep.toFixed(2)} m. The lower slab is a benched cut, not fill.`);

    const rs = retainStats(cfg);
    if (rs.max > 1.0)
      push(0, "note", `Max retained height against the shed walls is ${rs.max.toFixed(2)} m. Retaining over 1 m generally needs building approval and engineering in Queensland, and a surcharge from a slab or driveway above changes that threshold. Verify with a certifier.`);
    else if (rs.max > 0.1)
      push(0, "note", `Max retained height is ${rs.max.toFixed(2)} m.`);

    const ew = earthworks(cfg);
    push(0, "note", `Bulk earthworks approx ${Math.round(ew.cut)} m³ cut / ${Math.round(ew.fill)} m³ fill, deepest cut ${ew.maxCut.toFixed(2)} m. Sampled from the surface model, no bulking factor, no topsoil strip.`);

    const fall = Math.abs(naturalY(cfg, sxU, 0) - naturalY(cfg, lowEndX(cfg), 0));
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

/** Snap an opening to the nearest bay, returning the new offset. */
export function snapToBay(cfg: ShedConfig, o: Opening): number {
  const prof = profileFor(cfg, o.wall);
  const sp = spacingFor(cfg, o.wall);
  const n = Math.round(prof.w / sp);
  const k = Math.max(0, Math.min(n - 1, Math.floor((o.offset + o.width / 2) / sp)));
  return +(k * sp + (sp - o.width) / 2).toFixed(3);
}
