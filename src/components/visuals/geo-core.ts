/**
 * Geohash encoding (the standard base32 scheme) and a point quadtree, used by
 * the "Geohashes and quadtrees" visuals.
 */

const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export type Bounds = { minLat: number; maxLat: number; minLon: number; maxLon: number };

/** Interleave longitude and latitude bisection bits, 5 bits per character. */
export function geohash(lat: number, lon: number, precision: number): string {
  let minLat = -90;
  let maxLat = 90;
  let minLon = -180;
  let maxLon = 180;
  let out = "";
  let bit = 0;
  let ch = 0;
  let even = true; // even bits are longitude
  while (out.length < precision) {
    if (even) {
      const mid = (minLon + maxLon) / 2;
      if (lon >= mid) {
        ch = (ch << 1) | 1;
        minLon = mid;
      } else {
        ch <<= 1;
        maxLon = mid;
      }
    } else {
      const mid = (minLat + maxLat) / 2;
      if (lat >= mid) {
        ch = (ch << 1) | 1;
        minLat = mid;
      } else {
        ch <<= 1;
        maxLat = mid;
      }
    }
    even = !even;
    if (++bit === 5) {
      out += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return out;
}

export function geohashBounds(hash: string): Bounds {
  let minLat = -90;
  let maxLat = 90;
  let minLon = -180;
  let maxLon = 180;
  let even = true;
  for (const c of hash) {
    const v = BASE32.indexOf(c);
    for (let b = 4; b >= 0; b--) {
      const on = (v >> b) & 1;
      if (even) {
        const mid = (minLon + maxLon) / 2;
        if (on) minLon = mid;
        else maxLon = mid;
      } else {
        const mid = (minLat + maxLat) / 2;
        if (on) minLat = mid;
        else maxLat = mid;
      }
      even = !even;
    }
  }
  return { minLat, maxLat, minLon, maxLon };
}

/** Cell size in degrees at a precision. */
export function cellSize(precision: number) {
  const bits = precision * 5;
  const lonBits = Math.ceil(bits / 2);
  const latBits = Math.floor(bits / 2);
  return { dLon: 360 / 2 ** lonBits, dLat: 180 / 2 ** latBits };
}

/** The cell itself plus its 8 neighbours (found by stepping one cell from the centre). */
export function cellAndNeighbours(hash: string): string[] {
  const b = geohashBounds(hash);
  const cLat = (b.minLat + b.maxLat) / 2;
  const cLon = (b.minLon + b.maxLon) / 2;
  const dLat = b.maxLat - b.minLat;
  const dLon = b.maxLon - b.minLon;
  const out: string[] = [];
  for (const dy of [1, 0, -1]) for (const dx of [-1, 0, 1]) out.push(geohash(cLat + dy * dLat, cLon + dx * dLon, hash.length));
  return out;
}

/** Great-circle distance in metres. */
export function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = Math.PI / 180;
  const dLat = (lat2 - lat1) * toRad;
  const dLon = (lon2 - lon1) * toRad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * toRad) * Math.cos(lat2 * toRad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// ---------------------------------------------------------------- quadtree

export type QPoint = { x: number; y: number };
export type QNode = { x: number; y: number; size: number; depth: number; points: QPoint[]; kids: QNode[] | null };

/** Build a point quadtree over the unit square: a leaf splits into 4 once it holds more than `capacity` points. */
export function buildQuadtree(points: QPoint[], capacity: number, maxDepth = 9): QNode {
  function make(x: number, y: number, size: number, depth: number, pts: QPoint[]): QNode {
    if (pts.length <= capacity || depth >= maxDepth) return { x, y, size, depth, points: pts, kids: null };
    const h = size / 2;
    const quads: QPoint[][] = [[], [], [], []];
    for (const p of pts) quads[(p.x >= x + h ? 1 : 0) + (p.y >= y + h ? 2 : 0)].push(p);
    return {
      x,
      y,
      size,
      depth,
      points: [],
      kids: [make(x, y, h, depth + 1, quads[0]), make(x + h, y, h, depth + 1, quads[1]), make(x, y + h, h, depth + 1, quads[2]), make(x + h, y + h, h, depth + 1, quads[3])],
    };
  }
  return make(0, 0, 1, 0, points);
}

export function leaves(n: QNode): QNode[] {
  return n.kids ? n.kids.flatMap(leaves) : [n];
}

/** Range query for a square box; reports how many nodes and points were examined. */
export function queryBox(root: QNode, bx: number, by: number, bs: number) {
  let nodes = 0;
  let checked = 0;
  const found: QPoint[] = [];
  const visited: QNode[] = [];
  function rec(n: QNode) {
    if (n.x > bx + bs || n.x + n.size < bx || n.y > by + bs || n.y + n.size < by) return;
    nodes++;
    if (!n.kids) {
      visited.push(n);
      for (const p of n.points) {
        checked++;
        if (p.x >= bx && p.x <= bx + bs && p.y >= by && p.y <= by + bs) found.push(p);
      }
      return;
    }
    n.kids.forEach(rec);
  }
  rec(root);
  return { nodes, checked, found, visited };
}
