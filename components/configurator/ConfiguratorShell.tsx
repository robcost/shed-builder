"use client";

/**
 * Top-level configurator layout: a full-bleed 3D viewport overlaid with the
 * top bar, view toolbar, checks bar and the collapsible control panel. The
 * viewport is dynamically imported with `ssr: false` so WebGL never runs on the
 * server.
 */
import { useState } from "react";
import dynamic from "next/dynamic";
import { ChecksBar } from "@/components/configurator/ChecksBar";
import { ControlPanel } from "@/components/configurator/ControlPanel";
import { TopBar } from "@/components/configurator/TopBar";
import { ViewToolbar } from "@/components/configurator/ViewToolbar";
import { useShedConfig } from "@/hooks/useShedConfig";

const Viewport = dynamic(() => import("@/components/configurator/Viewport"), {
  ssr: false,
  loading: () => (
    <div className="absolute inset-0 grid place-items-center bg-gradient-to-b from-sky-100 to-stone-100 text-sm text-muted-foreground">
      Loading 3D view…
    </div>
  ),
});

type View = "iso" | "front" | "back" | "left" | "right" | "plan" | "section";

export function ConfiguratorShell() {
  const { cfg } = useShedConfig();
  const [viewKey, setViewKey] = useState("iso|0");
  const [shotKey, setShotKey] = useState(0);
  const [panelOpen, setPanelOpen] = useState(true);

  const view = (k: View) => setViewKey(`${k}|${Date.now()}`);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-stone-100">
      <Viewport cfg={cfg} viewKey={viewKey} shotKey={shotKey} />

      <div className="pointer-events-none absolute bottom-3 right-3 z-0 rounded-lg bg-card/70 px-2 py-1 font-mono text-[10px] text-muted-foreground backdrop-blur-sm">
        drag orbit · two-finger pan · pinch zoom
      </div>

      <TopBar onOpenPanel={() => setPanelOpen(true)} panelOpen={panelOpen} />
      <ViewToolbar onView={view} onShot={() => setShotKey(Date.now())} />
      <ChecksBar />
      <ControlPanel open={panelOpen} onClose={() => setPanelOpen(false)} />
    </div>
  );
}
