"use client";

/**
 * WebGL viewport. Owns the Three.js renderer, camera and an orbit rig, and
 * rebuilds the scene (debounced) whenever the config changes. Client-only — it
 * is dynamically imported with `ssr: false` so no WebGL / canvas runs on the
 * server.
 *
 * Input model (works on desktop and touch):
 * - one pointer drag  → orbit
 * - two-finger drag   → pan
 * - pinch             → zoom
 * - mouse wheel       → zoom
 * - shift / right drag → pan (mouse)
 */
import { useEffect, useRef } from "react";
import * as THREE from "three";
import { buildShed, skyTexture } from "@/lib/shed/scene";
import type { ShedConfig } from "@/types/shed";

interface ViewportProps {
  /** Configuration to render. */
  cfg: ShedConfig;
  /** `"<preset>|<nonce>"` — changing it snaps the camera to a view preset. */
  viewKey: string;
  /** Changing this number triggers a PNG screenshot download. */
  shotKey: number;
}

interface Orbit {
  r: number;
  theta: number;
  phi: number;
  target: THREE.Vector3;
}

interface ViewState {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  orbit: Orbit;
  sync: () => void;
  shed: THREE.Group | null;
}

const clampR = (r: number) => Math.max(3, Math.min(160, r));

/** The interactive 3D viewport. */
export default function Viewport({ cfg, viewKey, shotKey }: ViewportProps) {
  const mount = useRef<HTMLDivElement>(null);
  const st = useRef<Partial<ViewState>>({});

  // --- one-time renderer / camera / input setup ---
  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
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

    const orbit: Orbit = { r: 30, theta: Math.PI * 0.72, phi: Math.PI * 0.36, target: new THREE.Vector3(0, 1.2, 0) };
    const sync = () => {
      const { r, theta, phi, target } = orbit;
      camera.position.set(
        target.x + r * Math.sin(phi) * Math.sin(theta),
        target.y + r * Math.cos(phi),
        target.z + r * Math.sin(phi) * Math.cos(theta),
      );
      camera.lookAt(target);
    };
    sync();

    const dom = renderer.domElement;
    dom.style.touchAction = "none";
    dom.style.cursor = "grab";

    // Pointer bookkeeping supporting multi-touch gestures.
    const pointers = new Map<number, { x: number; y: number }>();
    let single: { x: number; y: number } | null = null; // last pos for 1-pointer orbit/pan
    let panMode = false; // mouse shift / right-button pan
    let twoPrev: { mid: { x: number; y: number }; dist: number } | null = null;

    const panBy = (dx: number, dy: number) => {
      const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
      const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);
      const k = orbit.r * 0.0016;
      orbit.target.addScaledVector(right, -dx * k).addScaledVector(up, dy * k);
    };

    const down = (e: PointerEvent) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      dom.setPointerCapture(e.pointerId);
      dom.style.cursor = "grabbing";
      if (pointers.size >= 2) {
        single = null;
        twoPrev = null;
      } else {
        panMode = e.pointerType === "mouse" && (e.button === 2 || e.shiftKey);
        single = { x: e.clientX, y: e.clientY };
      }
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const pts = [...pointers.values()];

      if (pts.length >= 2) {
        single = null;
        const [p0, p1] = pts;
        const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 };
        const dist = Math.hypot(p0.x - p1.x, p0.y - p1.y);
        if (twoPrev) {
          panBy(mid.x - twoPrev.mid.x, mid.y - twoPrev.mid.y);
          if (twoPrev.dist > 0 && dist > 0) orbit.r = clampR(orbit.r * (twoPrev.dist / dist));
          sync();
        }
        twoPrev = { mid, dist };
        return;
      }

      twoPrev = null;
      if (!single) {
        single = { x: e.clientX, y: e.clientY };
        return;
      }
      const dx = e.clientX - single.x, dy = e.clientY - single.y;
      single = { x: e.clientX, y: e.clientY };
      if (panMode) {
        panBy(dx, dy);
      } else {
        orbit.theta -= dx * 0.006;
        orbit.phi = Math.max(0.08, Math.min(Math.PI / 2 + 0.25, orbit.phi - dy * 0.005));
      }
      sync();
    };
    const up = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      twoPrev = null;
      single = null; // re-seeded on next move to avoid a jump
      if (pointers.size === 0) dom.style.cursor = "grab";
    };
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      orbit.r = clampR(orbit.r * Math.exp(e.deltaY * 0.0012));
      sync();
    };
    dom.addEventListener("pointerdown", down);
    dom.addEventListener("pointermove", move);
    dom.addEventListener("pointerup", up);
    dom.addEventListener("pointercancel", up);
    dom.addEventListener("wheel", wheel, { passive: false });
    dom.addEventListener("contextmenu", (e) => e.preventDefault());

    let raf = 0;
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
      cancelAnimationFrame(raf);
      ro.disconnect();
      dom.removeEventListener("pointerdown", down);
      dom.removeEventListener("pointermove", move);
      dom.removeEventListener("pointerup", up);
      dom.removeEventListener("pointercancel", up);
      dom.removeEventListener("wheel", wheel);
      renderer.dispose();
      if (dom.parentNode === el) el.removeChild(dom);
    };
  }, []);

  // --- rebuild the scene when the config changes (debounced) ---
  useEffect(() => {
    const rebuild = () => {
      const s = st.current;
      if (!s.scene) return;
      if (s.shed) {
        s.scene.remove(s.shed);
        s.shed.traverse((o) => {
          const mesh = o as THREE.Mesh;
          if (mesh.geometry) mesh.geometry.dispose();
          const mat = (mesh as THREE.Mesh).material;
          if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((m) => {
            const mm = m as THREE.MeshStandardMaterial;
            if (mm.map) mm.map.dispose();
            mm.dispose();
          });
        });
      }
      s.shed = buildShed(cfg);
      s.scene.add(s.shed);
    };
    const t = setTimeout(rebuild, 90);
    return () => clearTimeout(t);
  }, [cfg]);

  // --- camera view presets ---
  useEffect(() => {
    const s = st.current;
    if (!s.orbit || !s.sync || !viewKey) return;
    const k = viewKey.split("|")[0];
    const R = Math.max(cfg.length, cfg.span) * 2.0;
    const setView = (theta: number, phi: number, r: number, ty?: number) => {
      Object.assign(s.orbit!, { theta, phi, r });
      s.orbit!.target.set(0, ty !== undefined ? ty : cfg.wallHeight * 0.4, 0);
      s.sync!();
    };
    if (k === "iso") setView(Math.PI * 0.72, Math.PI * 0.36, R);
    if (k === "front") setView(0, Math.PI / 2 - 0.02, R * 1.05);
    if (k === "back") setView(Math.PI, Math.PI / 2 - 0.02, R * 1.05);
    if (k === "left") setView(-Math.PI / 2, Math.PI / 2 - 0.02, R * 1.05);
    if (k === "right") setView(Math.PI / 2, Math.PI / 2 - 0.02, R * 1.05);
    if (k === "plan") setView(0, 0.05, R * 1.1);
    if (k === "section") setView(Math.PI, Math.PI / 2 - 0.06, R * 0.95, 0.4);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey]);

  // --- screenshot ---
  useEffect(() => {
    if (!shotKey) return;
    const s = st.current;
    if (!s.renderer || !s.scene || !s.camera) return;
    s.renderer.render(s.scene, s.camera);
    const a = document.createElement("a");
    a.href = s.renderer.domElement.toDataURL("image/png");
    a.download = `shed-${cfg.length}x${cfg.span}.png`;
    a.click();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shotKey]);

  return <div ref={mount} className="absolute inset-0" />;
}
