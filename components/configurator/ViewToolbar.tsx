"use client";

/** Floating toolbar of camera view presets, screenshot and config export. */
import { Camera, Download } from "lucide-react";
import { toast } from "sonner";
import { useShedConfig } from "@/hooks/useShedConfig";
import { exportConfigFile } from "@/lib/shed/storage";

type View = "iso" | "front" | "back" | "left" | "right" | "plan" | "section";

const VIEWS: ReadonlyArray<readonly [View, string]> = [
  ["iso", "3D"], ["front", "Front"], ["back", "Back"], ["left", "Left"], ["right", "Right"], ["plan", "Plan"], ["section", "Section"],
];

export function ViewToolbar({
  onView,
  onShot,
}: {
  onView: (k: View) => void;
  onShot: () => void;
}) {
  const { cfg, setShow } = useShedConfig();

  return (
    <div className="thin-scroll pointer-events-auto absolute bottom-3 left-1/2 z-10 flex max-w-[calc(100%-1.5rem)] -translate-x-1/2 items-center gap-1 overflow-x-auto rounded-2xl border border-border/70 bg-card/85 p-1.5 shadow-lg ring-1 ring-black/5 backdrop-blur-xl">
      {VIEWS.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => {
            if (k === "section") setShow("section", true);
            onView(k);
          }}
          className="min-h-9 shrink-0 rounded-lg px-3 font-display text-[12px] font-medium tracking-wide text-foreground/80 transition hover:bg-muted hover:text-foreground active:scale-95"
        >
          {l}
        </button>
      ))}
      <span className="mx-0.5 h-6 w-px shrink-0 bg-border" />
      <button
        type="button"
        aria-label="Save screenshot"
        onClick={() => {
          onShot();
          toast.success("Screenshot saved");
        }}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground/80 transition hover:bg-muted active:scale-95"
      >
        <Camera className="size-4" />
      </button>
      <button
        type="button"
        aria-label="Export config"
        onClick={() => {
          exportConfigFile(cfg, `shed-${cfg.length}x${cfg.span}.json`);
          toast.success("Config exported");
        }}
        className="flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground/80 transition hover:bg-muted active:scale-95"
      >
        <Download className="size-4" />
      </button>
    </div>
  );
}
