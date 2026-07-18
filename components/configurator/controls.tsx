"use client";

/**
 * Touch-sized form atoms for the control panels, styled as engineering-drawing
 * instrumentation: tick-and-rule section eyebrows, monospace instrument-panel
 * readouts, and an amber brand accent reserved for selection. All targets are
 * sized for finger use on a tablet.
 */
import { useState } from "react";
import { Minus, Plus } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/** Format a number with sensible precision (no trailing zeros beyond 2 dp). */
function fmt(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

/** A titled group of controls. The header reads like a dimension annotation. */
export function Section({
  title,
  right,
  children,
}: {
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-b border-border/50 px-5 py-5 last:border-b-0">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="h-3 w-[3px] shrink-0 rounded-full bg-brand" />
        <h3 className="font-display text-[11px] font-semibold uppercase tracking-[0.22em] text-foreground/65">
          {title}
        </h3>
        {right ? right : <span className="rule-trail flex min-w-4 flex-1" />}
      </div>
      <div className="space-y-3.5">{children}</div>
    </section>
  );
}

/** A monospace instrument-panel readout for derived figures. */
export function Readout({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-xl border border-border/70 bg-muted/50 py-2.5 pl-4 pr-3.5 font-mono text-[11.5px] leading-relaxed tracking-tight text-muted-foreground tabular-nums",
        className,
      )}
    >
      <span className="absolute inset-y-2 left-0 w-[2.5px] rounded-full bg-brand/55" />
      {children}
    </div>
  );
}

/** A stepper number field with −/+ buttons and a direct-entry input. */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 0.1,
  unit = "m",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
}) {
  const clamp = (v: number) => Math.max(min, Math.min(max, v));
  const snap = (v: number) => +(Math.round(v / step) * step).toFixed(4);
  // While the field is focused, hold the raw text so in-progress values like
  // "-", "" or "1." are not clobbered by the controlled number (important for
  // typing negative levels). null = not editing, mirror `value`.
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? String(value);
  const commit = (raw: number) => onChange(clamp(raw));
  const stepBtn =
    "flex size-9 items-center justify-center rounded-lg border border-border bg-background text-muted-foreground transition hover:border-brand/50 hover:text-foreground active:scale-90 active:bg-brand/10 disabled:pointer-events-none disabled:opacity-35";
  const bump = (dir: 1 | -1) => {
    setDraft(null);
    onChange(clamp(snap(value + dir * step)));
  };
  return (
    <div className="flex items-center justify-between gap-3">
      <label className="text-[13px] font-medium text-foreground/75">{label}</label>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`Decrease ${label}`} onClick={() => bump(-1)} className={stepBtn} disabled={value <= min}>
          <Minus className="size-4" />
        </button>
        <div className="flex items-center rounded-lg border border-border bg-background transition focus-within:border-brand focus-within:ring-2 focus-within:ring-brand/25">
          <input
            type="text"
            inputMode="decimal"
            value={shown}
            onFocus={() => setDraft(String(value))}
            onBlur={() => setDraft(null)}
            onChange={(e) => {
              const raw = e.target.value;
              setDraft(raw);
              const v = parseFloat(raw);
              if (!isNaN(v)) commit(v);
            }}
            className="w-14 bg-transparent py-1.5 pl-2.5 text-right font-mono text-[13px] tabular-nums outline-none"
          />
          {unit && <span className="pr-2.5 pl-1 font-mono text-[10px] text-muted-foreground">{unit}</span>}
        </div>
        <button type="button" aria-label={`Increase ${label}`} onClick={() => bump(1)} className={stepBtn} disabled={value >= max}>
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

/** A labelled slider with a live monospace value readout. */
export function SliderField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  format,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
}) {
  return (
    <div>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <span className="text-[13px] font-medium text-foreground/75">{label}</span>
        <span className="font-mono text-[12px] tabular-nums text-foreground">{format ? format(value) : fmt(value)}</span>
      </div>
      <Slider
        value={[value]}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(Array.isArray(v) ? v[0] : (v as number))}
        className="py-1.5"
      />
    </div>
  );
}

/** A segmented button group. `columns` lays the options out in a grid. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  columns = 0,
  ariaLabel,
}: {
  options: ReadonlyArray<readonly [T, string]>;
  value: T;
  onChange: (v: T) => void;
  columns?: number;
  ariaLabel?: string;
}) {
  const grid = columns > 0;
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn(grid ? "grid gap-1.5" : "flex gap-1 rounded-xl bg-muted p-1")}
      style={grid ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
    >
      {options.map(([v, l]) => {
        const active = v === value;
        return (
          <button
            key={v}
            type="button"
            onClick={() => onChange(v)}
            className={cn(
              "min-h-9 rounded-lg px-3 py-1.5 text-[12.5px] font-medium transition active:scale-[0.98]",
              grid
                ? active
                  ? "border border-brand bg-brand/12 text-foreground ring-1 ring-brand/25"
                  : "border border-border bg-background text-foreground/75 hover:border-brand/40 hover:text-foreground"
                : active
                  ? "bg-background text-foreground shadow-sm ring-1 ring-brand/40"
                  : "text-muted-foreground hover:text-foreground",
              !grid && "flex-1",
            )}
          >
            {l}
          </button>
        );
      })}
    </div>
  );
}

/** A labelled switch row with an optional description. */
export function SwitchField({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3">
      <span>
        <span className="block text-[13px] font-medium text-foreground/90">{label}</span>
        {description && <span className="block text-[11.5px] text-muted-foreground">{description}</span>}
      </span>
      <Switch checked={checked} onCheckedChange={(v) => onChange(v)} className="data-checked:bg-brand" />
    </label>
  );
}
