import type { Lab } from "@/lib/lab/types";
import { getLabMeta } from "./catalog";
import { chat } from "./chat";
import { newsFeed } from "./news-feed";
import { rankedFeed } from "./ranked-feed";
import { urlShortener } from "./url-shortener";
import { videoPlatform } from "./video-platform";

/**
 * Playable labs. A lab is live when it's registered here and its catalogue
 * entry says "live"; everything else in the catalogue shows "coming soon".
 */
const labs: Lab[] = [urlShortener, videoPlatform, chat, newsFeed, rankedFeed];

export function liveLabs(): Lab[] {
  return labs.filter((l) => getLabMeta(l.slug)?.status === "live");
}

export function getLab(slug: string): Lab | undefined {
  return liveLabs().find((l) => l.slug === slug);
}
