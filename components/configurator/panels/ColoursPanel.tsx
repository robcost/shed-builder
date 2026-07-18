"use client";

/** Colorbond finish picker per building element. */
import { useState } from "react";
import { Section } from "@/components/configurator/controls";
import { useShedConfig } from "@/hooks/useShedConfig";
import { ELEMENTS, hexOf, PALETTE } from "@/lib/shed/constants";
import type { ColourElement } from "@/types/shed";

export function ColoursPanel() {
  const { cfg, setColour, setColourAll } = useShedConfig();
  const [picker, setPicker] = useState<ColourElement | null>(null);

  return (
    <Section title="Colorbond finish">
      <div className="space-y-1.5">
        {ELEMENTS.map(([k, l]) => {
          const open = picker === k;
          return (
            <div key={k}>
              <button
                type="button"
                onClick={() => setPicker(open ? null : k)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition ${open ? "border-brand bg-brand/5 ring-1 ring-brand/20" : "border-border bg-background hover:border-brand/40 hover:bg-muted/40"}`}
              >
                <span className="size-8 shrink-0 rounded-lg border border-border" style={{ background: hexOf(cfg.colours[k]) }} />
                <span className="flex-1">
                  <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">{l}</span>
                  <span className="block font-mono text-[13px] text-foreground">{cfg.colours[k]}</span>
                </span>
              </button>
              {open && (
                <div className="mt-1.5 rounded-xl border border-border bg-muted/30 p-2.5">
                  <div className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Standard colours</div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {PALETTE.map((p) => (
                      <button
                        key={p.n}
                        type="button"
                        title={p.n}
                        onClick={() => setColour(k, p.n)}
                        className={`aspect-square rounded-lg border-2 transition ${cfg.colours[k] === p.n ? "border-brand ring-2 ring-brand/30" : "border-border hover:border-foreground/40"}`}
                        style={{ background: p.h }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setColourAll(cfg.colours[k])}
                    className="mt-2.5 w-full rounded-lg border border-border py-2 text-[12px] text-foreground/80 transition hover:bg-muted active:scale-[0.99]"
                  >
                    Apply {cfg.colours[k]} to everything
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-[12px] leading-snug text-muted-foreground">Screen approximations, not colour-matched.</p>
    </Section>
  );
}
