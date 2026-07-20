"use client";

/** Top bar: title, design summary, the designs menu and the panel toggle. */
import { useRef, useState } from "react";
import { FolderOpen, PanelRightOpen, Plus, RotateCcw, Save, Share2, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { ShedMark } from "@/components/configurator/ShedMark";
import { useShedConfig } from "@/hooks/useShedConfig";
import { bayOf, backInternal, dropOf } from "@/lib/shed/geometry";
import { buildShareUrl } from "@/lib/shed/share";
import { parseConfig } from "@/lib/shed/storage";

export function TopBar({ onOpenPanel, panelOpen }: { onOpenPanel: () => void; panelOpen: boolean }) {
  const {
    cfg, designs, currentName, currentDesignId,
    saveCurrentAs, openDesign, removeDesign, newDesign, reset, importConfig,
  } = useShedConfig();
  const [menu, setMenu] = useState(false);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const drop = dropOf(cfg);

  const doSave = () => {
    const n = (name || currentName).trim();
    if (!n) {
      toast.error("Give the design a name first");
      return;
    }
    saveCurrentAs(n);
    setName("");
    toast.success(`Saved “${n}”`);
  };

  const doShare = async () => {
    const url = buildShareUrl(cfg);
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Share link copied to clipboard");
    } catch {
      toast.error("Couldn't copy the link");
    }
  };

  const doImport = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        importConfig(parseConfig(String(reader.result)));
        toast.success("Config imported");
        setMenu(false);
      } catch {
        toast.error("That file is not a valid shed config");
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex items-start justify-between gap-3">
      {/* Title + summary */}
      <div className="pointer-events-auto flex items-center gap-3 rounded-2xl border border-border/70 bg-card/85 py-2.5 pl-2.5 pr-4 shadow-lg ring-1 ring-black/5 backdrop-blur-xl">
        <ShedMark />
        <div>
          <div className="flex items-center gap-2">
            <span className="font-display text-[15px] font-semibold leading-none tracking-tight text-foreground">Shed Builder</span>
            {currentName && (
              <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-[10.5px] font-medium leading-none text-brand-foreground">
                {currentName}
              </span>
            )}
          </div>
          <div className="mt-1.5 font-mono text-[10.5px] leading-none tracking-tight text-muted-foreground tabular-nums">
            {cfg.length.toFixed(1)} × {cfg.span.toFixed(1)} m · {cfg.bays} bays @ {bayOf(cfg).toFixed(2)} m
            {cfg.split.enabled && (
              <>
                {" · "}internal {backInternal(cfg).lo.toFixed(2)}–{backInternal(cfg).hi.toFixed(2)} m · step −{drop.toFixed(2)} m
              </>
            )}
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="pointer-events-auto flex items-center gap-2">
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/85 px-3.5 py-2 font-display text-[12.5px] font-medium tracking-wide text-foreground/80 shadow-lg ring-1 ring-black/5 backdrop-blur-xl transition hover:bg-card hover:text-foreground active:scale-95"
          >
            <FolderOpen className="size-4" /> Designs
          </button>
          {menu && (
            <>
              <button type="button" aria-label="Close menu" onClick={() => setMenu(false)} className="fixed inset-0 z-10 cursor-default" />
              <div className="absolute right-0 z-20 mt-2 w-72 overflow-hidden rounded-2xl border border-border bg-card shadow-xl ring-1 ring-black/5">
                <div className="border-b border-border/60 p-2.5">
                  <div className="flex gap-1.5">
                    <input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && doSave()}
                      placeholder={currentName || "Design name"}
                      className="min-w-0 flex-1 rounded-lg border border-border bg-background px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
                    />
                    <button
                      type="button"
                      onClick={doSave}
                      className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-[12px] font-semibold text-brand-foreground shadow-sm transition hover:brightness-105 active:scale-95"
                    >
                      <Save className="size-3.5" /> {currentDesignId ? "Update" : "Save"}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={doShare}
                  className="flex w-full items-center justify-center gap-1.5 border-b border-border/60 px-2.5 py-2 text-[12px] font-medium text-foreground/80 transition hover:bg-muted"
                >
                  <Share2 className="size-3.5" /> Copy share link
                </button>
                <div className="max-h-64 overflow-y-auto">
                  {designs.length === 0 && <p className="px-3 py-4 text-center text-[12px] text-muted-foreground">No saved designs yet.</p>}
                  {designs.map((d) => (
                    <div key={d.id} className={`flex items-center gap-2 px-2.5 py-2 transition hover:bg-muted/60 ${d.id === currentDesignId ? "bg-muted/40" : ""}`}>
                      <button type="button" onClick={() => { openDesign(d.id); setMenu(false); toast.success(`Opened “${d.name}”`); }} className="flex flex-1 items-center gap-2 text-left">
                        <FolderOpen className="size-3.5 text-muted-foreground" />
                        <span className="flex-1">
                          <span className="block text-[13px] text-foreground">{d.name}</span>
                          <span className="block text-[10.5px] text-muted-foreground">{new Date(d.updatedAt).toLocaleString()}</span>
                        </span>
                      </button>
                      <button type="button" aria-label={`Delete ${d.name}`} onClick={() => { removeDesign(d.id); toast.success(`Deleted “${d.name}”`); }} className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition hover:text-destructive">
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex items-center gap-1 border-t border-border/60 p-2">
                  <button type="button" onClick={() => { newDesign(); setMenu(false); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[12px] text-foreground/80 transition hover:bg-muted">
                    <Plus className="size-3.5" /> New
                  </button>
                  <button type="button" onClick={() => { reset(); setMenu(false); }} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[12px] text-foreground/80 transition hover:bg-muted">
                    <RotateCcw className="size-3.5" /> Reset
                  </button>
                  <button type="button" onClick={() => fileRef.current?.click()} className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-border py-1.5 text-[12px] text-foreground/80 transition hover:bg-muted">
                    <Upload className="size-3.5" /> Import
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    accept="application/json,.json"
                    className="hidden"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) doImport(f);
                      e.target.value = "";
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {!panelOpen && (
          <button
            type="button"
            onClick={onOpenPanel}
            className="flex items-center gap-2 rounded-xl border border-border/70 bg-card/85 px-3.5 py-2 font-display text-[12.5px] font-medium tracking-wide text-foreground/80 shadow-lg ring-1 ring-black/5 backdrop-blur-xl transition hover:bg-card hover:text-foreground active:scale-95"
          >
            <PanelRightOpen className="size-4" /> Configure
          </button>
        )}
      </div>
    </div>
  );
}
