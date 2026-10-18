import type { CacheValueOption } from "../../../sim";

/** What a Redis entry for a short link could hold. Only the long URL answers a redirect alone. */
export const CACHE_VALUES: CacheValueOption[] = [
  { v: "long_url", label: "long_url (where the link points)", useful: true },
  { v: "id", label: "id (the row's number)", useful: false },
  { v: "created_at", label: "created_at (when it was made)", useful: false },
];
