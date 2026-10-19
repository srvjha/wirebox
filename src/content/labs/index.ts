import type { Lab } from "@/lib/lab/types";
import { getLabMeta } from "./catalog";
import { notifications } from "./notifications";
import { pastebin } from "./pastebin";
import { presence } from "./presence";
import { searchAutocomplete } from "./search-autocomplete";
import { urlShortener } from "./url-shortener";

/**
 * Playable labs. A lab is live when it's registered here and its catalogue
 * entry says "live"; everything else in the catalogue shows "coming soon".
 */
const labs: Lab[] = [urlShortener, pastebin, notifications, searchAutocomplete, presence];

export function liveLabs(): Lab[] {
  return labs.filter((l) => getLabMeta(l.slug)?.status === "live");
}

export function getLab(slug: string): Lab | undefined {
  return liveLabs().find((l) => l.slug === slug);
}
