"use client";

/** Wall openings: roller doors, PA doors and windows with per-opening editing. */
import { Plus, Trash2 } from "lucide-react";
import { NumberField, Section, Segmented } from "@/components/configurator/controls";
import { useShedConfig } from "@/hooks/useShedConfig";
import { useValidation } from "@/hooks/useValidation";
import { TYPE_LABEL, WALLS } from "@/lib/shed/constants";
import { isLowX, profileFor, worldAtU } from "@/lib/shed/geometry";
import type { OpeningType, Wall } from "@/types/shed";

const ADD_BUTTONS: ReadonlyArray<readonly [OpeningType, string]> = [
  ["roller", "Roller"], ["pa", "PA"], ["window", "Window"],
];

export function OpeningsPanel() {
  const { cfg, setOpening, addOpening, removeOpening, centreOpening } = useShedConfig();
  const { issues } = useValidation(cfg);

  return (
    <Section
      title="Openings"
      right={
        <div className="flex gap-1">
          {ADD_BUTTONS.map(([t, l]) => (
            <button
              key={t}
              type="button"
              onClick={() => addOpening(t)}
              className="flex items-center gap-1 rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-foreground/80 transition hover:bg-muted active:scale-95"
            >
              <Plus className="size-3" /> {l}
            </button>
          ))}
        </div>
      }
    >
      <div className="space-y-3">
        {cfg.openings.map((o, i) => {
          const bad = issues.some((x) => x.id === o.id && x.sev === "err");
          const prof = profileFor(cfg, o.wall);
          const wx = worldAtU(cfg, o.wall, o.offset + o.width / 2).x;
          const level = isLowX(cfg, wx) ? "lower" : "upper";
          return (
            <div
              key={o.id}
              className={`rounded-xl border p-3 ${bad ? "border-destructive/60 bg-destructive/5" : "border-border bg-muted/30"}`}
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="flex items-center gap-2 font-mono text-[12px] text-foreground">
                  {TYPE_LABEL[o.type]} {i + 1}
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {level}
                  </span>
                </span>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => centreOpening(o.id)}
                    className="rounded-lg border border-border px-2 py-1 text-[11px] text-foreground/70 transition hover:bg-muted active:scale-95"
                  >
                    Centre in bay
                  </button>
                  <button
                    type="button"
                    aria-label="Remove opening"
                    onClick={() => removeOpening(o.id)}
                    className="flex items-center rounded-lg border border-border px-2 py-1 text-[11px] text-foreground/70 transition hover:border-destructive/60 hover:text-destructive active:scale-95"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
              <div className="mb-2">
                <Segmented
                  columns={2}
                  options={WALLS as ReadonlyArray<readonly [Wall, string]>}
                  value={o.wall}
                  onChange={(v) => setOpening(o.id, { wall: v })}
                  ariaLabel="Wall"
                />
              </div>
              <div className="space-y-2">
                <NumberField label="Width" value={o.width} min={0.4} max={14} onChange={(v) => setOpening(o.id, { width: v })} />
                <NumberField label="Height" value={o.height} min={0.4} max={8} onChange={(v) => setOpening(o.id, { height: v })} />
                <NumberField label="Offset from corner" value={o.offset} min={0} max={prof.w} onChange={(v) => setOpening(o.id, { offset: v })} />
                {o.type !== "roller" && (
                  <NumberField label="Sill above its slab" value={o.sill} min={0} max={4} onChange={(v) => setOpening(o.id, { sill: v })} />
                )}
              </div>
            </div>
          );
        })}
        {cfg.openings.length === 0 && (
          <p className="text-[12px] text-muted-foreground">No openings yet. Add a roller door, PA door or window above.</p>
        )}
      </div>
      <p className="mt-3 text-[12px] leading-snug text-muted-foreground">
        Offset runs from the left corner viewed from outside. Sills are measured from whichever slab that opening sits over.
      </p>
    </Section>
  );
}
