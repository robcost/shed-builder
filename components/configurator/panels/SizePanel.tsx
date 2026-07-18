"use client";

/** Size / roof / bays / view controls. */
import { NumberField, Readout, Section, Segmented, SliderField, SwitchField } from "@/components/configurator/controls";
import { useShedConfig } from "@/hooks/useShedConfig";
import { D } from "@/lib/shed/constants";
import { bayOf, endSpacingOf, ridgeHeight, skillionAlongX, skillionRun } from "@/lib/shed/geometry";
import type { ShowKey, Wall } from "@/types/shed";

const SKILLION_DIRS: ReadonlyArray<readonly [Wall, string]> = [
  ["front", "Front side"], ["back", "Back side"], ["left", "Left end"], ["right", "Right end"],
];

const SHOW_TOGGLES: ReadonlyArray<readonly [ShowKey, string]> = [
  ["dims", "Dimensions & natural surface"], ["labels", "Room labels"], ["grid", "Bay grid overlay"],
  ["slab", "Slabs & step"], ["retaining", "Retaining walls"], ["ground", "Terrain & sky"],
  ["section", "Cut away front wall"],
];

export function SizePanel() {
  const { cfg, set, setShow } = useShedConfig();

  return (
    <>
      <Section title="Building">
        <NumberField label="Span (width)" value={cfg.span} min={3} max={30} onChange={(v) => set({ span: v })} />
        <NumberField label="Length" value={cfg.length} min={4} max={60} onChange={(v) => set({ length: v })} />
        <NumberField label="Wall height" value={cfg.wallHeight} min={2.1} max={9} onChange={(v) => set({ wallHeight: v })} />
      </Section>

      <Section title="Roof">
        <Segmented
          options={[["gable", "Gable"], ["skillion", "Skillion"]] as const}
          value={cfg.roofType}
          onChange={(v) => set({ roofType: v, pitch: v === "gable" ? 11 : 6 })}
        />
        {cfg.roofType === "skillion" && (
          <div className="space-y-2">
            <div className="text-[11px] uppercase tracking-wider text-muted-foreground">Falls toward</div>
            <Segmented columns={2} options={SKILLION_DIRS} value={cfg.skillionLow} onChange={(v) => set({ skillionLow: v })} />
            <Readout>
              falls across {skillionRun(cfg).toFixed(2)} m · rise {(skillionRun(cfg) * Math.tan(D(cfg.pitch))).toFixed(2)} m
              <br />low wall {cfg.wallHeight.toFixed(2)} m · high wall {ridgeHeight(cfg).toFixed(2)} m
              {skillionAlongX(cfg) && cfg.split.enabled && (
                <span className="mt-1 block">
                  Falling along the length: the roof{" "}
                  {cfg.skillionLow === cfg.split.lowEnd
                    ? "drops with the slab, so the lower section keeps a normal ceiling"
                    : "rises over the lower section, stacking the fall on top of the step"}
                  .
                </span>
              )}
            </Readout>
          </div>
        )}
        <SliderField label="Pitch" value={cfg.pitch} min={2} max={30} step={0.5} onChange={(v) => set({ pitch: v })} format={(v) => `${v}°`} />
        <Readout>Ridge {ridgeHeight(cfg).toFixed(2)} m above the upper slab</Readout>
        <div className="grid grid-cols-2 gap-3">
          <NumberField label="Eave o'hang" value={cfg.eaveOverhang} min={0} max={1} step={0.05} onChange={(v) => set({ eaveOverhang: v })} />
          <NumberField label="Gable o'hang" value={cfg.gableOverhang} min={0} max={1} step={0.05} onChange={(v) => set({ gableOverhang: v })} />
        </div>
      </Section>

      <Section title="Bays">
        <SliderField
          label="Portal frames"
          value={cfg.bays}
          min={1}
          max={16}
          step={1}
          onChange={(v) => set({ bays: v })}
          format={(v) => `${v} bays · ${(cfg.length / v).toFixed(2)} m`}
        />
        <p className="text-[12px] leading-snug text-muted-foreground">
          End posts at <span className="font-mono text-foreground/80">{endSpacingOf(cfg).toFixed(2)} m</span>. Bay spacing{" "}
          <span className="font-mono text-foreground/80">{bayOf(cfg).toFixed(2)} m</span>. The step wants to land on a bay line.
        </p>
      </Section>

      <Section title="View">
        {SHOW_TOGGLES.map(([k, l]) => (
          <SwitchField key={k} label={l} checked={cfg.show[k]} onChange={(v) => setShow(k, v)} />
        ))}
      </Section>
    </>
  );
}
