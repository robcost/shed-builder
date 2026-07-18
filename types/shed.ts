/**
 * Domain types for the shed configurator.
 *
 * These mirror the shape of the `DEFAULTS` config object in the original
 * prototype (`shed-configurator-v2.jsx`) exactly. The engine (`lib/shed/*`) is a
 * verbatim port of that prototype; these types describe the single `ShedConfig`
 * object that flows through geometry, validation and the Three.js scene builder.
 */

/** A face of the building, viewed in plan. `front`/`back` are the long side walls; `left`/`right` are the gable ends. */
export type Wall = "front" | "back" | "left" | "right";

/** The kind of opening cut into a wall. */
export type OpeningType = "roller" | "pa" | "window";

/** Roof form. */
export type RoofType = "gable" | "skillion";

/** Which gable end the split-level slab drops toward. */
export type LowEnd = "left" | "right";

/** Which long wall a fit-out element (bathroom / stair) sits against. */
export type Side = "front" | "back";

/** A Colorbond colour name (one of the entries in `PALETTE`). */
export type ColourName = string;

/** The building elements that carry an independent colour selection. */
export type ColourElement =
  | "walls"
  | "roof"
  | "rollerDoors"
  | "gutter"
  | "barge"
  | "corner"
  | "windows"
  | "paDoors";

/** The toggleable scene overlays / features. */
export type ShowKey =
  | "dims"
  | "grid"
  | "ground"
  | "slab"
  | "retaining"
  | "labels"
  | "section";

/** A door / window / roller-door opening in a wall. */
export interface Opening {
  /** Stable identifier, also used to key validation issues to an opening. */
  id: number;
  /** Wall the opening is cut into. */
  wall: Wall;
  /** Opening kind. */
  type: OpeningType;
  /** Width in metres. */
  width: number;
  /** Height in metres. */
  height: number;
  /** Distance in metres from the left corner of the wall (viewed from outside). */
  offset: number;
  /** Sill height in metres above whichever slab the opening sits over. */
  sill: number;
}

/** A lean-to / awning attached to a wall. */
export interface Awning {
  /** Wall the lean-to attaches to. */
  side: Wall;
  /** Distance in metres from the left corner of that wall. */
  offset: number;
  /** Length of the lean-to along the wall, in metres. */
  length: number;
  /** How far the lean-to projects out from the wall, in metres. */
  projection: number;
  /** Roof pitch of the lean-to, in degrees. */
  pitch: number;
}

/** Split-level slab configuration. */
export interface Split {
  /** Whether the slab is split into an upper and lower level. */
  enabled: boolean;
  /** The gable end that the lower slab drops toward. */
  lowEnd: LowEnd;
  /** Length of the lower section along the building length, in metres. */
  backLen: number;
  /** Vertical drop from the upper slab to the lower slab, in metres. */
  drop: number;
}

/**
 * Site / earthworks parameters. The natural ground surface is defined by a grid
 * of editable spot levels pinned to the shed footprint and bilinearly
 * interpolated between nodes (see `naturalY`).
 */
export interface Terrain {
  /** Number of grid rows across the span (row 0 = front / +z, last row = back / −z). */
  rows: number;
  /** Number of grid columns along the length (col 0 = left / −x, last col = right / +x). */
  cols: number;
  /**
   * Spot levels in metres RL (0 = upper-slab datum), row-major so that the level
   * at grid node (r, c) is `levels[r * cols + c]`. Length must equal `rows * cols`.
   */
  levels: number[];
  /** Working margin around the footprint for the benched pad, in metres. */
  margin: number;
  /** Cut batter slope, expressed as the run for 1 unit of rise (1:x). */
  cutBatter: number;
  /** Fill batter slope, expressed as the run for 1 unit of rise (1:x). */
  fillBatter: number;
}

/** Bathroom sub-configuration within the lower-level fit-out. */
export interface BathConfig {
  /** Long wall the bathroom sits against. */
  side: Side;
  /** Width along the span, in metres. */
  width: number;
  /** Depth along the length, in metres. */
  depth: number;
}

/** Stair sub-configuration within the lower-level fit-out. */
export interface StairConfig {
  /** Long wall the stair sits against. */
  side: Side;
  /** Stair width, in metres. */
  width: number;
  /** Offset from the wall, in metres. */
  offset: number;
}

/** Lower-level habitable fit-out (gym / granny flat / bathroom / stair). */
export interface Fitout {
  /** Whether the lower level is fitted out. */
  enabled: boolean;
  /** Ceiling height in metres above the lower slab. */
  ceiling: number;
  /** Whether a ceiling panel is drawn over the granny flat + bathroom. */
  ceilingPanel: boolean;
  /** Length of the gym along the building length, in metres. */
  gymLen: number;
  /** Bathroom configuration. */
  bath: BathConfig;
  /** Stair configuration. */
  stairs: StairConfig;
}

/** Per-element Colorbond colour selections. */
export type Colours = Record<ColourElement, ColourName>;

/** Toggleable scene overlays. */
export type Show = Record<ShowKey, boolean>;

/** The complete configuration object for a shed design. */
export interface ShedConfig {
  /** Building span (width across the gable), in metres. */
  span: number;
  /** Building length, in metres. */
  length: number;
  /** External wall height, in metres. */
  wallHeight: number;
  /** Roof pitch, in degrees. */
  pitch: number;
  /** Roof form. */
  roofType: RoofType;
  /** For a skillion roof, the wall the roof falls toward. */
  skillionLow: Wall;
  /** Number of portal-frame bays along the length. */
  bays: number;
  /** Eave overhang, in metres. */
  eaveOverhang: number;
  /** Gable overhang, in metres. */
  gableOverhang: number;
  /** Split-level slab configuration. */
  split: Split;
  /** Site / earthworks parameters. */
  terrain: Terrain;
  /** Lower-level fit-out. */
  fitout: Fitout;
  /** Wall openings. */
  openings: Opening[];
  /** Lean-tos / awnings. */
  awnings: Awning[];
  /** Per-element colours. */
  colours: Colours;
  /** Scene overlay toggles. */
  show: Show;
}

/** Severity of a validation issue. */
export type Severity = "err" | "warn" | "note";

/** A one-tap fix for a validation issue. */
export interface Fix {
  /** Human-readable button label describing the fix. */
  label: string;
  /** Apply the fix to a config, returning the new config or `null` if it cannot be applied. */
  apply: (cfg: ShedConfig) => ShedConfig | null;
}

/** A single validation finding. */
export interface Issue {
  /** Opening id the issue relates to, or `0` for building-level, or negative for awnings. */
  id: number;
  /** Severity. */
  sev: Severity;
  /** Human-readable message. */
  msg: string;
  /** Optional one-tap fix. */
  fix?: Fix;
}

/** A named, saved design as persisted to local storage. */
export interface SavedDesign {
  /** Stable id. */
  id: string;
  /** User-given name. */
  name: string;
  /** ISO timestamp of the last save. */
  updatedAt: string;
  /** The saved configuration. */
  cfg: ShedConfig;
}
