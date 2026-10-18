import type { Lab } from "@/lib/lab/types";
import { getLabMeta } from "./catalog";
import { urlShortener } from "./url-shortener";

/**
 * Playable labs. A lab is live when it's registered here and its catalogue
 * entry says "live"; everything else in the catalogue shows "coming soon".
 */
const labs: Lab[] = [urlShortener];

export function liveLabs(): Lab[] {
  return labs.filter((l) => getLabMeta(l.slug)?.status === "live");
}

export function getLab(slug: string): Lab | undefined {
  return liveLabs().find((l) => l.slug === slug);
}
