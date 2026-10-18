import { hash32 } from "./algo-hash";

/**
 * HyperLogLog with 2^p registers over a 32-bit hash (Flajolet et al., 2007),
 * including the small-range (linear counting) and large-range corrections.
 */

export function hllAdd(regs: Uint8Array, p: number, item: string) {
  const h = hash32(item);
  const idx = h >>> (32 - p);
  const rest = (h << p) >>> 0;
  const rho = rest === 0 ? 32 - p + 1 : Math.clz32(rest) + 1;
  if (rho > regs[idx]) regs[idx] = rho;
}

function alpha(m: number) {
  if (m === 16) return 0.673;
  if (m === 32) return 0.697;
  if (m === 64) return 0.709;
  return 0.7213 / (1 + 1.079 / m);
}

export function hllEstimate(regs: Uint8Array): number {
  const m = regs.length;
  let z = 0;
  let zeros = 0;
  for (const r of regs) {
    z += 2 ** -r;
    if (r === 0) zeros++;
  }
  let e = (alpha(m) * m * m) / z;
  if (e <= 2.5 * m && zeros > 0) e = m * Math.log(m / zeros);
  else if (e > 2 ** 32 / 30) e = -(2 ** 32) * Math.log(1 - e / 2 ** 32);
  return e;
}

/** Relative standard error of the estimate. */
export const hllStdError = (p: number) => 1.04 / Math.sqrt(2 ** p);

/** Register memory in bytes at 6 bits per register (what Redis uses). */
export const hllBytes = (p: number) => (2 ** p * 6) / 8;
