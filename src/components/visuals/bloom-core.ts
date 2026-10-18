import { hash32 } from "./algo-hash";

/**
 * A plain Bloom filter: m bits, k hash functions. The k positions come from
 * two base hashes combined as h1 + i·h2 (Kirsch–Mitzenmacher double hashing),
 * which behaves like k independent hashes for this purpose.
 */

export function bloomPositions(item: string, m: number, k: number): number[] {
  const h1 = hash32(item);
  const h2 = hash32(item, 0x9747b28c) | 1;
  const out: number[] = [];
  for (let i = 0; i < k; i++) out.push(((h1 + Math.imul(i, h2)) >>> 0) % m);
  return out;
}

export function buildBloom(items: Iterable<string>, m: number, k: number): Uint8Array {
  const bits = new Uint8Array(m);
  for (const item of items) for (const p of bloomPositions(item, m, k)) bits[p] = 1;
  return bits;
}

export function bloomHas(bits: Uint8Array, item: string, k: number): boolean {
  return bloomPositions(item, bits.length, k).every((p) => bits[p] === 1);
}

/** Expected false-positive rate after n inserts: (1 − e^(−kn/m))^k. */
export function bloomFpr(m: number, k: number, n: number): number {
  if (n <= 0) return 0;
  return Math.pow(1 - Math.exp((-k * n) / m), k);
}
