import type { Drill } from "@/lib/drill/types";
import { getDrillMeta } from "./catalog";
import { chat } from "./chat";
import { collabEditor } from "./collab-editor";
import { fileSync } from "./file-sync";
import { keyValueStore } from "./key-value-store";
import { newsFeed } from "./news-feed";
import { notifications } from "./notifications";
import { pastebin } from "./pastebin";
import { payments } from "./payments";
import { presence } from "./presence";
import { rankedFeed } from "./ranked-feed";
import { rideDispatch } from "./ride-dispatch";
import { searchAutocomplete } from "./search-autocomplete";
import { ticketBooking } from "./ticket-booking";
import { urlShortener } from "./url-shortener";
import { videoPlatform } from "./video-platform";

/**
 * Playable drills. A drill is live when it's registered here and its catalogue
 * entry says "live"; everything else in the catalogue shows "coming soon".
 */
const drills: Drill[] = [
  urlShortener,
  pastebin,
  notifications,
  videoPlatform,
  chat,
  newsFeed,
  ticketBooking,
  payments,
  rideDispatch,
  collabEditor,
  fileSync,
  rankedFeed,
  presence,
  searchAutocomplete,
  keyValueStore,
];

export function liveDrills(): Drill[] {
  return drills.filter((l) => getDrillMeta(l.slug)?.status === "live");
}

export function getDrill(slug: string): Drill | undefined {
  return liveDrills().find((l) => l.slug === slug);
}
