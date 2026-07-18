"use client";

/** Collapsible validation panel: errors, warnings and notes with one-tap fixes. */
import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { useShedConfig } from "@/hooks/useShedConfig";
import { useValidation } from "@/hooks/useValidation";
import { cn } from "@/lib/utils";
import type { Severity } from "@/types/shed";

const DOT: Record<Severity, string> = {
  err: "bg-red-500",
  warn: "bg-amber-500",
  note: "bg-sky-500",
};
const TEXT: Record<Severity, string> = {
  err: "text-red-700",
  warn: "text-amber-700",
  note: "text-sky-700",
};

export function ChecksBar() {
  const { cfg, applyFix, fixAll } = useShedConfig();
  const { errs, warns, notes } = useValidation(cfg);
  const [open, setOpen] = useState(true);
  const [filter, setFilter] = useState<Severity | "all">("all");

  const all = [...errs, ...warns, ...notes];
  const shown = all.filter((it) => filter === "all" || it.sev === filter);

  const chip = (sev: Severity, count: number, colour: string) => (
    <button
      type="button"
      onClick={() => setFilter(filter === sev ? "all" : sev)}
      className={cn(
        "rounded-md px-2 py-0.5 font-mono text-[12px] tabular-nums transition",
        colour,
        filter === sev ? "bg-muted ring-1 ring-border" : "hover:bg-muted/60",
      )}
    >
      {count}
    </button>
  );

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="pointer-events-auto absolute bottom-3 left-3 z-20 flex items-center gap-2.5 rounded-xl border border-border/70 bg-card/85 px-3.5 py-2.5 shadow-lg ring-1 ring-black/5 backdrop-blur-xl transition hover:bg-card"
      >
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Checks</span>
        <span className={cn("font-mono text-[12px]", errs.length ? "text-red-600" : "text-emerald-600")}>{errs.length}</span>
        <span className="font-mono text-[12px] text-amber-600">{warns.length}</span>
        <span className="font-mono text-[12px] text-sky-600">{notes.length}</span>
        <ChevronUp className="size-3.5 text-muted-foreground" />
      </button>
    );
  }

  return (
    <div className="pointer-events-auto absolute bottom-3 left-3 z-20 flex max-h-[44vh] w-[min(560px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl">
      <div className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-gradient-to-b from-white/40 to-transparent px-3.5 py-2.5">
        <span className="font-display text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Checks</span>
        {chip("err", errs.length, "text-red-600")}
        {chip("warn", warns.length, "text-amber-600")}
        {chip("note", notes.length, "text-sky-600")}
        <div className="flex-1" />
        {errs.some((e) => e.fix) && (
          <button
            type="button"
            onClick={() => fixAll(["err"])}
            className="rounded-lg bg-brand px-2.5 py-1 text-[11px] font-semibold text-brand-foreground shadow-sm transition hover:brightness-105 active:scale-95"
          >
            Fix all clashes
          </button>
        )}
        {!errs.some((e) => e.fix) && warns.some((w) => w.fix) && (
          <button
            type="button"
            onClick={() => fixAll(["err", "warn"])}
            className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-foreground/80 transition hover:bg-muted active:scale-95"
          >
            Fix all warnings
          </button>
        )}
        <button
          type="button"
          aria-label="Collapse checks"
          onClick={() => setOpen(false)}
          className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        <ul className="divide-y divide-border/50">
          {shown.map((it, i) => (
            <li key={i} className="flex items-start gap-2.5 px-3 py-2 text-[12.5px] leading-snug">
              <span className={cn("mt-[5px] size-1.5 shrink-0 rounded-full", DOT[it.sev])} />
              <span className={cn("flex-1", TEXT[it.sev])}>{it.msg}</span>
              {it.fix && (
                <button
                  type="button"
                  onClick={() => applyFix(it.fix!)}
                  title={it.fix.label}
                  className="mt-px shrink-0 rounded-lg border border-border bg-background px-2 py-1 text-[11px] text-foreground/80 transition hover:border-primary/50 hover:bg-muted active:scale-95"
                >
                  {it.fix.label}
                </button>
              )}
            </li>
          ))}
          {shown.length === 0 && <li className="px-3 py-3 text-[12.5px] text-muted-foreground">Nothing here.</li>}
        </ul>
      </div>
    </div>
  );
}
