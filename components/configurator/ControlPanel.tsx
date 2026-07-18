"use client";

/** Right-docked, collapsible control panel with tabbed configuration sections. */
import { useState } from "react";
import { X } from "lucide-react";
import { ColoursPanel } from "@/components/configurator/panels/ColoursPanel";
import { FitoutPanel } from "@/components/configurator/panels/FitoutPanel";
import { OpeningsPanel } from "@/components/configurator/panels/OpeningsPanel";
import { SizePanel } from "@/components/configurator/panels/SizePanel";
import { SplitPanel } from "@/components/configurator/panels/SplitPanel";
import { cn } from "@/lib/utils";

type Tab = "size" | "split" | "fitout" | "openings" | "colours";

const TABS: ReadonlyArray<readonly [Tab, string]> = [
  ["size", "Size"], ["split", "Split"], ["fitout", "Fit-out"], ["openings", "Openings"], ["colours", "Colour"],
];

export function ControlPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("split");
  if (!open) return null;

  return (
    <aside className="pointer-events-auto absolute inset-y-3 right-3 z-20 flex w-[min(392px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border border-border/70 bg-card/85 shadow-2xl ring-1 ring-black/5 backdrop-blur-xl sm:top-[5.25rem]">
      <div className="flex items-center gap-1 border-b border-border/60 bg-gradient-to-b from-white/40 to-transparent p-2">
        <div className="thin-scroll flex flex-1 gap-0.5 overflow-x-auto">
          {TABS.map(([k, l]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={cn(
                "min-h-9 shrink-0 rounded-lg px-3 font-display text-[12px] font-medium tracking-wide transition",
                tab === k
                  ? "bg-brand text-brand-foreground shadow-sm"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              {l}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-label="Close panel"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition hover:bg-muted hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="thin-scroll min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {tab === "size" && <SizePanel />}
        {tab === "split" && <SplitPanel />}
        {tab === "fitout" && <FitoutPanel />}
        {tab === "openings" && <OpeningsPanel />}
        {tab === "colours" && <ColoursPanel />}
      </div>
    </aside>
  );
}
