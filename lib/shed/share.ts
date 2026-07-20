/**
 * Shareable design links. The entire `ShedConfig` is compressed with lz-string
 * and carried in the URL fragment (`#d=…`), so a design can be shared by link
 * with no backend. The fragment is client-only (never sent to a server), and
 * incoming links are normalized through `parseConfig` just like a JSON import.
 */
import {
  compressToEncodedURIComponent,
  decompressFromEncodedURIComponent,
} from "lz-string";
import { parseConfig } from "@/lib/shed/storage";
import type { ShedConfig } from "@/types/shed";

/** Fragment key that carries the encoded design. */
const SHARE_KEY = "d";

/** Compress a config to a URL-safe token. */
export function encodeConfig(cfg: ShedConfig): string {
  return compressToEncodedURIComponent(JSON.stringify(cfg));
}

/** Decode a shared token back into a normalized config, or `null` if invalid. */
export function decodeConfig(token: string): ShedConfig | null {
  try {
    const json = decompressFromEncodedURIComponent(token);
    if (!json) return null;
    return parseConfig(json);
  } catch {
    return null;
  }
}

/** Build a full shareable URL for a design (empty string on the server). */
export function buildShareUrl(cfg: ShedConfig): string {
  if (typeof window === "undefined") return "";
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#${SHARE_KEY}=${encodeConfig(cfg)}`;
}

/**
 * Read a shared design from the current URL fragment, or `null` if none/invalid.
 * The token is read raw (not via `URLSearchParams`) because lz-string's URL-safe
 * alphabet contains `+`, which form-decoding would turn into a space.
 */
export function readSharedConfig(): ShedConfig | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const seg = hash.split("&").find((s) => s.startsWith(`${SHARE_KEY}=`));
  if (!seg) return null;
  const token = seg.slice(SHARE_KEY.length + 1);
  return token ? decodeConfig(token) : null;
}

/** Strip the share fragment from the address bar without a navigation. */
export function clearShareHash(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}
