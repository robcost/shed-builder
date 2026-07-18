"use client";

/** Lower-level fit-out: gym / granny flat / bathroom / stair. */
import { NumberField, Readout, Section, Segmented, SwitchField } from "@/components/configurator/controls";
import { useShedConfig } from "@/hooks/useShedConfig";
import { backInternal, dropOf } from "@/lib/shed/geometry";
import type { Side } from "@/types/shed";

const BATH_SIDES: ReadonlyArray<readonly [Side, string]> = [
  ["front", "Front corner"], ["back", "Back corner"],
];
const STAIR_SIDES: ReadonlyArray<readonly [Side, string]> = [
  ["front", "Against front wall"], ["back", "Against back wall"],
];

export function FitoutPanel() {
  const { cfg, setIn } = useShedConfig();
  const drop = dropOf(cfg);
  const enabled = cfg.fitout.enabled && cfg.split.enabled;

  return (
    <>
      <Section title="Lower level fit-out">
        <SwitchField label="Fit out the lower level" checked={cfg.fitout.enabled} onChange={(v) => setIn("fitout", { enabled: v })} />
        {!cfg.split.enabled && <p className="text-[12px] text-muted-foreground">Turn on the split level first.</p>}
        {enabled && (
          <>
            <NumberField label="Gym length" value={cfg.fitout.gymLen} min={1} max={Math.max(1, cfg.split.backLen - 2.5)} onChange={(v) => setIn("fitout", { gymLen: v })} />
            <NumberField label="Ceiling height" value={cfg.fitout.ceiling} min={2.1} max={+(backInternal(cfg).lo - 0.2).toFixed(2)} step={0.05} onChange={(v) => setIn("fitout", { ceiling: v })} />
            <SwitchField label="Ceiling over the flat" checked={cfg.fitout.ceilingPanel} onChange={(v) => setIn("fitout", { ceilingPanel: v })} />
            <Readout>
              gym {(cfg.fitout.gymLen * cfg.span).toFixed(1)} m² · flat{" "}
              {((cfg.split.backLen - cfg.fitout.gymLen) * cfg.span - cfg.fitout.bath.width * cfg.fitout.bath.depth).toFixed(1)} m²
              <br />void above the flat ceiling {(backInternal(cfg).lo - cfg.fitout.ceiling).toFixed(2)} m at the low eave
            </Readout>
          </>
        )}
      </Section>

      {enabled && (
        <>
          <Section title="Bathroom">
            <Segmented options={BATH_SIDES} value={cfg.fitout.bath.side} onChange={(v) => setIn("fitout", { bath: { ...cfg.fitout.bath, side: v } })} />
            <NumberField label="Width (along span)" value={cfg.fitout.bath.width} min={1.2} max={cfg.span - 1} onChange={(v) => setIn("fitout", { bath: { ...cfg.fitout.bath, width: v } })} />
            <NumberField label="Depth (along length)" value={cfg.fitout.bath.depth} min={1.2} max={4} onChange={(v) => setIn("fitout", { bath: { ...cfg.fitout.bath, depth: v } })} />
            <p className="text-[12px] leading-snug text-muted-foreground">
              {(cfg.fitout.bath.width * cfg.fitout.bath.depth).toFixed(1)} m². A toilet, basin and 900 shower wants about 2.0 × 2.4 m minimum.
            </p>
          </Section>

          <Section title="Stair">
            <Segmented options={STAIR_SIDES} value={cfg.fitout.stairs.side} onChange={(v) => setIn("fitout", { stairs: { ...cfg.fitout.stairs, side: v } })} />
            <NumberField label="Width" value={cfg.fitout.stairs.width} min={0.8} max={2} onChange={(v) => setIn("fitout", { stairs: { ...cfg.fitout.stairs, width: v } })} />
            <NumberField label="Offset from wall" value={cfg.fitout.stairs.offset} min={0} max={3} onChange={(v) => setIn("fitout", { stairs: { ...cfg.fitout.stairs, offset: v } })} />
            <Readout>
              {Math.ceil(drop / 0.19)} risers @ {((drop / Math.ceil(drop / 0.19)) * 1000).toFixed(0)} mm ·{" "}
              {(Math.ceil(drop / 0.19) * 0.25).toFixed(2)} m run
            </Readout>
          </Section>
        </>
      )}
    </>
  );
}
