/**
 * The shape of real traffic, used to turn configuration (cache key, limiter
 * rule) into effects (hit rate, share of requests let through).
 */

export const TRAFFIC = {
  /** Share of reads that go to the few hottest keys (power-law traffic). */
  hotShare: 0.8,
  /** Number of hot keys. */
  hotKeys: 200,
  /** Chance a read of a long-tail key is already cached. */
  tailHit: 0.15,
  /** Share of reads for items created in the last `freshMs`. */
  freshShare: 0.05,
  freshMs: 2_000,
  /** Share of repeat clicks a browser answers itself after a permanent redirect. */
  browserRepeat: 0.15,
} as const;

/** Where real users' traffic comes from: how many requests/s each source IP sends. */
export const IP_PROFILE = [
  { label: "one person", perIp: 1, share: 0.55 },
  { label: "a small office", perIp: 8, share: 0.2 },
  { label: "a big office", perIp: 25, share: 0.15 },
  { label: "a campus or mobile carrier (NAT)", perIp: 60, share: 0.1 },
] as const;

/** A scraper spreads its traffic over this many IPs. */
export const BOT_IPS = 20;

export type LimiterBy = "ip" | "path" | "global";

export type LimiterConfig = { by: LimiterBy; rate: number };

export type LimiterEffect = { legitPass: number; attackPass: number; note: string };

export function limiterEffect(
  cfg: LimiterConfig,
  load: { legit: number; attack: number },
): LimiterEffect {
  const rate = Math.max(0, cfg.rate);
  if (cfg.by === "global") {
    const total = load.legit + load.attack;
    const pass = total > 0 ? Math.min(1, rate / total) : 1;
    return {
      legitPass: pass,
      attackPass: pass,
      note: "A global limit can't tell a bot from a fan: everyone is cut by the same share.",
    };
  }
  if (cfg.by === "path") {
    // Hot items get thousands of real requests per path; the bot's random paths get ~1 each.
    const hotPerPath = (load.legit * TRAFFIC.hotShare) / TRAFFIC.hotKeys;
    const hotPass = hotPerPath > 0 ? Math.min(1, rate / hotPerPath) : 1;
    const legitPass = TRAFFIC.hotShare * hotPass + (1 - TRAFFIC.hotShare);
    return {
      legitPass,
      attackPass: 1,
      note: "Limiting by path throttles your most popular links and does nothing to a bot that asks for a different path each time.",
    };
  }
  const legitPass = IP_PROFILE.reduce((sum, p) => sum + p.share * Math.min(1, rate / p.perIp), 0);
  const botPerIp = load.attack / BOT_IPS;
  const attackPass = botPerIp > 0 ? Math.min(1, rate / botPerIp) : 1;
  return { legitPass, attackPass, note: "" };
}

export type CacheConfig = {
  /** Key template, e.g. "link:{slug}". */
  key: string;
  /** Which stored value the cache holds; null when unset. */
  value: string | null;
  onMiss: "each" | "coalesce";
  writeThrough: boolean;
};

export const DEFAULT_CACHE: CacheConfig = { key: "", value: null, onMiss: "each", writeThrough: false };

export type CacheValueOption = { v: string; label: string; useful: boolean };

export type CacheProfile = {
  /** Fraction of real reads answered by the cache when fully warm. */
  hit: number;
  /** True when a hit still needs the database (the cached value isn't enough). */
  hitNeedsDb: boolean;
  /** True when a hit may return another key's data. */
  wrong: boolean;
  note?: string;
};

export function cacheProfile(
  cfg: CacheConfig,
  param: string,
  values: CacheValueOption[],
): CacheProfile {
  const key = cfg.key.trim();
  if (!key) return { hit: 0, hitNeedsDb: false, wrong: false, note: "Set a cache key." };
  if (!cfg.value) return { hit: 0, hitNeedsDb: false, wrong: false, note: "Choose what the cache stores." };
  const usesParam = key.includes(`{${param}}`);
  const perUser = key.includes("{client_ip}") || key.includes("{user_id}");
  const useful = values.find((v) => v.v === cfg.value)?.useful ?? false;
  const warmHit = TRAFFIC.hotShare + (1 - TRAFFIC.hotShare) * TRAFFIC.tailHit;
  if (!usesParam) {
    return {
      hit: 0.99,
      hitNeedsDb: false,
      wrong: true,
      note: `The key doesn't include {${param}}, so every request shares one entry and gets someone else's answer.`,
    };
  }
  if (perUser) {
    return {
      hit: warmHit * 0.04,
      hitNeedsDb: !useful,
      wrong: false,
      note: "The key includes who's asking, so each user gets a private copy and almost nothing is shared.",
    };
  }
  if (!useful) {
    return {
      hit: warmHit,
      hitNeedsDb: true,
      wrong: false,
      note: `Caching ${cfg.value} doesn't help: the response needs more than that, so every hit still queries the database.`,
    };
  }
  return { hit: warmHit, hitNeedsDb: false, wrong: false };
}
