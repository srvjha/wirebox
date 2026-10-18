/**
 * Deterministic hashing and randomness for the "Classic algorithms" visuals.
 *
 * Everything here gives the same answer on the server and in every browser,
 * so simulations render identically during SSR and hydration.
 */

/** 32-bit FNV-1a over UTF-16 code units. */
export function fnv1a32(input: string, seed = 0x811c9dc5): number {
  let h = seed >>> 0;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * MurmurHash3's finaliser. FNV-1a alone mixes the last characters of short,
 * similar strings ("node-A#1", "node-A#2") poorly into the high bits; this
 * avalanche step makes every output bit depend on every input bit.
 */
export function fmix32(x: number): number {
  let h = x >>> 0;
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

/** FNV-1a followed by an avalanche mix: a well-spread unsigned 32-bit hash. */
export function hash32(input: string, seed?: number): number {
  return fmix32(fnv1a32(input, seed));
}

export function hex32(n: number): string {
  return (n >>> 0).toString(16).padStart(8, "0");
}

/** Number of leading zero bits in an unsigned 32-bit integer. */
export function clz32(n: number): number {
  return Math.clz32(n >>> 0);
}

/** Small seeded PRNG (mulberry32). Returns floats in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A whole-number seed derived from wall-clock time, for "shuffle" buttons. */
export function freshSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
