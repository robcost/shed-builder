"use client";

/**
 * Plan-view editor for the terrain spot-level grid. Each node is a tappable cell
 * tinted by height (cool = low, warm = high); tap one and set its RL with the
 * stepper below. Edges are labelled Front / Back / Left / Right to match the 3D
 * model orientation.
 */
import { useState } from "react";
import { NumberField } from "@/components/configurator/controls";
import { cn } from "@/lib/utils";
import type { Terrain } from "@/types/shed";

/** Tint a level within [min, max] from cool-blue (low) to warm-amber (high). */
function tint(level: number, min: number, max: number): string {
  const t = max > min ? (level - min) / (max - min) : 0.5;
  const hue = 205 - t * 165;
  const light = 82 - t * 15;
  return `hsl(${hue.toFixed(0)} 66% ${light.toFixed(0)}%)`;
}

function nodeName(r: number, c: number, rows: number, cols: number): string {
  const row = r === 0 ? "front" : r === rows - 1 ? "back" : "mid";
  const col = c === 0 ? "left" : c === cols - 1 ? "right" : "mid";
  if (row === "mid" && col === "mid") return "centre";
  return [row, col].filter((s) => s !== "mid").join("-");
}

export function TerrainGrid({
  terrain,
  onLevels,
}: {
  terrain: Terrain;
  onLevels: (levels: number[]) => void;
}) {
  const { rows, cols, levels } = terrain;
  const [sel, setSel] = useState(0);
  const s = Math.min(sel, levels.length - 1);
  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const sr = Math.floor(s / cols);
  const sc = s % cols;

  return (
    <div className="space-y-2.5">
      <div className="text-center font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Front
      </div>
      <div className="flex items-stretch gap-1.5">
        <div className="flex w-3 items-center justify-center">
          <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground [writing-mode:vertical-rl] rotate-180">
            Left
          </span>
        </div>
        <div className="grid flex-1 gap-1.5" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
          {levels.map((lv, i) => {
            const active = i === s;
            return (
              <button
                key={i}
                type="button"
                onClick={() => setSel(i)}
                style={{ background: tint(lv, min, max) }}
                className={cn(
                  "flex aspect-[4/3] min-h-11 items-center justify-center rounded-lg border font-mono text-[11px] tabular-nums text-stone-900 transition",
                  active ? "z-10 border-brand ring-2 ring-brand/50" : "border-black/10 hover:border-brand/50",
                )}
              >
                {lv.toFixed(2)}
              </button>
            );
          })}
        </div>
        <div className="flex w-3 items-center justify-center">
          <span className="font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground [writing-mode:vertical-rl]">
            Right
          </span>
        </div>
      </div>
      <div className="text-center font-display text-[9px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        Back
      </div>
      <NumberField
        label={`Level · ${nodeName(sr, sc, rows, cols)}`}
        value={levels[s]}
        min={-8}
        max={3}
        step={0.05}
        unit="m"
        onChange={(v) => {
          const next = [...levels];
          next[s] = v;
          onLevels(next);
        }}
      />
    </div>
  );
}
