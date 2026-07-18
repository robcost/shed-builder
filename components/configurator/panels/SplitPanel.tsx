"use client";

/** Split-level slab and site / earthworks controls. */
import { useMemo } from "react";
import { NumberField, Readout, Section, Segmented, SwitchField } from "@/components/configurator/controls";
import { TerrainGrid } from "@/components/configurator/panels/TerrainGrid";
import { useShedConfig } from "@/hooks/useShedConfig";
import { backInternal, bayOf, dropOf, earthworks, resampleTerrainLevels, retainStats, splitX } from "@/lib/shed/geometry";
import type { LowEnd } from "@/types/shed";

const LOW_END: ReadonlyArray<readonly [LowEnd, string]> = [
  ["left", "Low end: left"], ["right", "Low end: right"],
];

export function SplitPanel() {
  const { cfg, setIn } = useShedConfig();
  const drop = dropOf(cfg);

  const ew = useMemo(() => (cfg.split.enabled ? earthworks(cfg) : null), [cfg]);

  const snapStep = () => {
    const bay = bayOf(cfg);
    const k = Math.max(1, Math.min(cfg.bays - 1, Math.round(((splitX(cfg) as number) + cfg.length / 2) / bay)));
    const nx = -cfg.length / 2 + k * bay;
    setIn("split", {
      backLen: +(cfg.split.lowEnd === "left" ? nx + cfg.length / 2 : cfg.length / 2 - nx).toFixed(3),
    });
  };

  return (
    <>
      <Section title="Split level">
        <SwitchField label="Split-level slab" checked={cfg.split.enabled} onChange={(v) => setIn("split", { enabled: v })} />
        {cfg.split.enabled && (
          <>
            <Segmented options={LOW_END} value={cfg.split.lowEnd} onChange={(v) => setIn("split", { lowEnd: v })} />
            <NumberField label="Lower section length" value={cfg.split.backLen} min={2} max={cfg.length - 3} onChange={(v) => setIn("split", { backLen: v })} />
            <NumberField label="Slab drop" value={cfg.split.drop} min={0.2} max={3.5} step={0.05} onChange={(v) => setIn("split", { drop: v })} />
            <button
              type="button"
              onClick={snapStep}
              className="w-full rounded-lg border border-border py-2 text-[12.5px] text-foreground/80 transition hover:bg-muted active:scale-[0.99]"
            >
              Snap the step to the nearest portal frame
            </button>
            <Readout>
              step at x = {(splitX(cfg) as number).toFixed(2)} m · lower slab RL −{drop.toFixed(2)}
              <br />internal height back {backInternal(cfg).lo.toFixed(2)}–{backInternal(cfg).hi.toFixed(2)} m
              <br />retained max {retainStats(cfg).max.toFixed(2)} m
            </Readout>
          </>
        )}
      </Section>

      {cfg.split.enabled && (
        <>
        <Section title="Ground contours">
          <p className="text-[12px] leading-snug text-muted-foreground">
            Set the natural ground level (RL) at each grid node on the footprint. The surface is
            interpolated between them; add rows or columns for finer control along an edge.
          </p>
          <NumberField
            label="Grid rows (front–back)"
            value={cfg.terrain.rows}
            min={2}
            max={5}
            step={1}
            unit=""
            onChange={(v) => setIn("terrain", { rows: v, levels: resampleTerrainLevels(cfg, v, cfg.terrain.cols) })}
          />
          <NumberField
            label="Grid columns (left–right)"
            value={cfg.terrain.cols}
            min={2}
            max={5}
            step={1}
            unit=""
            onChange={(v) => setIn("terrain", { cols: v, levels: resampleTerrainLevels(cfg, cfg.terrain.rows, v) })}
          />
          <TerrainGrid terrain={cfg.terrain} onLevels={(levels) => setIn("terrain", { levels })} />
        </Section>

        <Section title="Earthworks">
          <NumberField label="Working margin" value={cfg.terrain.margin} min={0.3} max={4} step={0.1} onChange={(v) => setIn("terrain", { margin: v })} />
          <div className="grid grid-cols-2 gap-3">
            <NumberField label="Cut batter 1:" value={cfg.terrain.cutBatter} min={0.3} max={4} step={0.1} unit="" onChange={(v) => setIn("terrain", { cutBatter: v })} />
            <NumberField label="Fill batter 1:" value={cfg.terrain.fillBatter} min={1} max={5} step={0.1} unit="" onChange={(v) => setIn("terrain", { fillBatter: v })} />
          </div>
          {ew && (
            <Readout>
              cut {Math.round(ew.cut)} m³ · deepest {ew.maxCut.toFixed(2)} m
              <br />fill {Math.round(ew.fill)} m³ · deepest {ew.maxFill.toFixed(2)} m
              <br />net {Math.round(ew.cut - ew.fill) > 0 ? "export" : "import"} ≈ {Math.abs(Math.round(ew.cut - ew.fill))} m³
              <span className="mt-1 block opacity-70">Surface model only. No topsoil strip, no bulking, no over-excavation.</span>
            </Readout>
          )}
        </Section>
        </>
      )}
    </>
  );
}
