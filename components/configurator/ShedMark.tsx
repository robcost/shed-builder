/**
 * The Shed Builder wordmark glyph: a portal-frame shed on a steel tile, with the
 * roofline picked out in the brand amber. Used in the top bar.
 */
import { cn } from "@/lib/utils";

export function ShedMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm ring-1 ring-black/10",
        className,
      )}
      aria-hidden
    >
      <svg viewBox="0 0 24 24" className="size-5" fill="none">
        {/* roofline — brand amber */}
        <path d="M3 11 L12 4 L21 11" stroke="var(--brand)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
        {/* portal frame + floor */}
        <path d="M5.5 11 V20 M18.5 11 V20 M4.5 20 H19.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
        {/* roller door */}
        <path d="M10 20 V15 H14 V20" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.55" />
      </svg>
    </span>
  );
}
