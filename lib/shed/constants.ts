/**
 * Domain constants for the shed configurator — ported verbatim from the
 * prototype (`shed-configurator-v2.jsx`). Values and behaviour are unchanged;
 * only types have been added.
 */
import type {
  ColourElement,
  OpeningType,
  ShedConfig,
  Wall,
} from "@/types/shed";

/**
 * Colorbond-range approximations. Screen hexes only, not colour-matched.
 */
export const PALETTE: ReadonlyArray<{ n: string; h: string }> = [
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

/** Resolve a colour name to its screen hex, defaulting to Monument. */
export const hexOf = (n: string): string =>
  (PALETTE.find((p) => p.n === n) || PALETTE[24]).h;

/** Colourable building elements, as `[key, label]` pairs. */
export const ELEMENTS: ReadonlyArray<readonly [ColourElement, string]> = [
  ["walls", "Walls (external)"], ["roof", "Roof"], ["rollerDoors", "Roller doors"],
  ["gutter", "Gutter & fascia"], ["barge", "Gable end capping"], ["corner", "Corner flashing"],
  ["windows", "Window frames"], ["paDoors", "PA doors"],
];

/** The four walls, as `[key, label]` pairs. */
export const WALLS: ReadonlyArray<readonly [Wall, string]> = [
  ["front", "Front side wall"], ["back", "Back side wall"],
  ["left", "Left end"], ["right", "Right end"],
];

/** Display labels for opening types. */
export const TYPE_LABEL: Record<OpeningType, string> = {
  roller: "Roller door",
  pa: "PA door",
  window: "Window",
};

/** Default dimensions for a newly added opening of each type. */
export const OPENING_PRESETS: Record<
  OpeningType,
  { width: number; height: number; sill: number }
> = {
  roller: { width: 3.0, height: 2.7, sill: 0 },
  pa: { width: 0.82, height: 2.04, sill: 0 },
  window: { width: 1.8, height: 1.2, sill: 1.0 },
};

/** Degrees → radians. */
export const D = (d: number): number => (d * Math.PI) / 180;

/** Half-width of a portal column / end post, in metres. */
export const COL_HALF = 0.09;

/** Minimum practical opening height by type, in metres. */
export const MIN_H: Record<OpeningType, number> = {
  roller: 2.0,
  pa: 1.98,
  window: 0.5,
};

/** The default shed configuration the app opens with. */
export const DEFAULTS: ShedConfig = {
  span: 7, length: 14, wallHeight: 3.0, pitch: 11, roofType: "gable", skillionLow: "front", bays: 5,
  eaveOverhang: 0.15, gableOverhang: 0.15,
  split: { enabled: true, lowEnd: "left", backLen: 6, drop: 1.5 },
  terrain: {
    rows: 3,
    cols: 3,
    // RL (m), row-major. Row 0 = front, last row = back; col 0 = left, last = right.
    // Falls toward the back-left corner.
    levels: [
      0.0, 0.0, 0.0,
      -0.6, -0.3, 0.0,
      -1.5, -0.8, 0.0,
    ],
    margin: 1.0,
    cutBatter: 1.0,
    fillBatter: 1.5,
  },
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
