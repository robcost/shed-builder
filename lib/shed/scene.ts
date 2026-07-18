/**
 * Textures, sprites and the Three.js scene builder — ported verbatim from the
 * prototype (`shed-configurator-v2.jsx`). `buildShed` assembles the entire scene
 * graph for a configuration. Behaviour is unchanged; only types were added and a
 * few literal arrays annotated to satisfy the compiler.
 *
 * This module calls `document.createElement("canvas")` inside its texture
 * helpers, so it must only run in the browser (it is imported by the client-only
 * `Viewport` component).
 */
import * as THREE from "three";
import { COL_HALF, D, hexOf } from "@/lib/shed/constants";
import {
  backInternal,
  baseAt,
  bayOf,
  dropOf,
  fitoutPlan,
  highEndX,
  lowEndX,
  lowSign,
  naturalY,
  profileFor,
  ridgeHeight,
  skillionAlongX,
  skillionRun,
  spacingFor,
  splitX,
  terrainY,
  topAt,
  wallBasis,
  worldAtU,
} from "@/lib/shed/geometry";
import { WALLS } from "@/lib/shed/constants";
import type { ShedConfig } from "@/types/shed";

/* ============================================================================
   Textures / sprites
============================================================================ */
function ribCanvas(vertical: boolean): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = vertical ? 128 : 8;
  c.height = vertical ? 8 : 128;
  const g = c.getContext("2d")!;
  const grad = vertical ? g.createLinearGradient(0, 0, 128, 0) : g.createLinearGradient(0, 0, 0, 128);
  const stops: [number, string][] = [
    [0, "#ffffff"], [0.3, "#f4f4f4"], [0.4, "#b4b4b4"], [0.47, "#8f8f8f"],
    [0.53, "#ffffff"], [0.6, "#b4b4b4"], [0.7, "#f4f4f4"], [1, "#ffffff"],
  ];
  stops.forEach(([p, col]) => grad.addColorStop(p, col));
  g.fillStyle = grad;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

function makeRib({ vertical = true, repeat = [5, 1] as [number, number] } = {}): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(ribCanvas(vertical));
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

function grassTexture(rep: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
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

function skyTexture(): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 4; c.height = 256;
  const g = c.getContext("2d")!;
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, "#5d8cc4"); grad.addColorStop(0.55, "#a8c4dd"); grad.addColorStop(1, "#dfe6e6");
  g.fillStyle = grad; g.fillRect(0, 0, 4, 256);
  return new THREE.CanvasTexture(c);
}

function textSprite(text: string, tone: "dim" | "room" = "dim"): THREE.Sprite {
  const c = document.createElement("canvas");
  const ctx = c.getContext("2d")!;
  const font = "600 44px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + 28;
  c.width = w; c.height = 64;
  const g = c.getContext("2d")!;
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

/** Export the sky texture builder so the viewport can set the scene background. */
export { skyTexture };

/* ============================================================================
   Scene builder
============================================================================ */
/** Build the complete Three.js scene graph for a configuration. */
export function buildShed(cfg: ShedConfig): THREE.Group {
  const root = new THREE.Group();
  const c = cfg.colours;
  const drop = dropOf(cfg);
  const p = D(cfg.pitch);
  const ridgeY = ridgeHeight(cfg);
  const eaveOh = cfg.eaveOverhang;
  const gblOh = cfg.gableOverhang;

  const steel = (name: string, tex?: THREE.Texture | null) => new THREE.MeshStandardMaterial({
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
  const trim = (n: string) => steel(n);

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
    const yOf = (o: (typeof mine)[number]) => baseAt(prof, o.offset + o.width / 2) + o.sill;
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
        const bars: [number, number, number, number][] = [
          [o.width, 0.05, cxu, y + 0.025], [o.width, 0.05, cxu, y + o.height - 0.025],
          [0.05, o.height, o.offset + 0.025, y + o.height / 2],
          [0.05, o.height, o.offset + o.width - 0.025, y + o.height / 2],
          [0.04, o.height, cxu, y + o.height / 2],
        ];
        bars.forEach(([w, h, x, yy]) => {
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
      const pts: [number, number][] = [];
      const N = 60;
      for (let i = 0; i <= N; i++) {
        const u = (i / N) * prof.w;
        const wp = worldAtU(cfg, wall, u);
        const nat = naturalY(cfg, wp.x, wp.z);
        pts.push([u, Math.max(baseAt(prof, u), Math.min(nat + 0.15, topAt(prof, u)))]);
      }
      const hasCut = pts.some(([u, y]) => y - baseAt(prof, u) > 0.08);
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
  const gutterAt = (z: number, y: number) => {
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
    const mkSlab = (x0: number, x1: number, topY: number) => {
      const s = new THREE.Mesh(new THREE.BoxGeometry(Math.abs(x1 - x0), 0.15, S), CONCRETE);
      s.position.set((x0 + x1) / 2, topY - 0.075, 0);
      s.receiveShadow = true;
      root.add(s);
    };
    if (cfg.split.enabled) {
      const sx = splitX(cfg) as number;
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

    const partition = (
      a: { x: number; z: number },
      b: { x: number; z: number },
      y0: number,
      y1: number,
      doors: { u: number; w: number; h: number }[] | null,
      mat: THREE.Material,
    ) => {
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
    const rail = (za: number, zb: number) => {
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
      const lbl = (x: number, z: number, t: string) => {
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
        return [w.x, w.z] as [number, number];
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
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    const dim = (a: THREE.Vector3, b: THREE.Vector3, label: string, off: THREE.Vector3) => {
      const g = new THREE.Group();
      const A = a.clone().add(off), B = b.clone().add(off);
      const mat = new THREE.LineBasicMaterial({ color: 0x14161a, depthTest: false, transparent: true });
      const line = (p1: THREE.Vector3, p2: THREE.Vector3) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), mat);
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
      const sx = splitX(cfg) as number;
      dim(V(sx, 0, -S / 2), V(sx, -drop, -S / 2), `${drop.toFixed(2)} m step`, V(0, 0, -1.2));
      dim(V(lowEndX(cfg), -drop, -S / 2), V(sx, -drop, -S / 2), `${cfg.split.backLen.toFixed(2)} m lower`, V(0, 0, -2.4));
      dim(V(lowEndX(cfg), -drop, 0), V(lowEndX(cfg), backInternal(cfg).lo - drop, 0),
        `${backInternal(cfg).lo.toFixed(2)} m internal`, V(lowSign(cfg) * 1.6, 0, 0));
      // natural surface line along the centre for reference
      const pts: THREE.Vector3[] = [];
      for (let i = 0; i <= 80; i++) {
        const x = -L / 2 - 6 + (i / 80) * (L + 12);
        pts.push(new THREE.Vector3(x, naturalY(cfg, x, -S / 2 - 3.2), -S / 2 - 3.2));
      }
      const nl = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints(pts),
        new THREE.LineDashedMaterial({ color: 0x8b4513, dashSize: 0.3, gapSize: 0.2, depthTest: false })
      );
      nl.computeLineDistances();
      root.add(nl);
      const nlb = textSprite("natural surface");
      nlb.position.set(-L / 2 - 4, naturalY(cfg, -L / 2 - 4, -S / 2 - 3.2) + 0.5, -S / 2 - 3.2);
      root.add(nlb);
    }
    const bay = bayOf(cfg);
    for (let k = 0; k < cfg.bays; k++)
      dim(V(-L / 2 + k * bay, 0.02, -S / 2), V(-L / 2 + (k + 1) * bay, 0.02, -S / 2), `${bay.toFixed(2)}`, V(0, 0, -1.0));
  }

  return root;
}
