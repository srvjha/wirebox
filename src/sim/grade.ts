import { SPECS, type Kind } from "./spec";

export type Constraint =
  | { type: "successRate"; min: number }
  | { type: "p99"; maxMs: number }
  | { type: "budget"; maxUsd: number }
  | { type: "minNodes"; kind: Kind; n: number; why?: string }
  | { type: "maxNodes"; kind: Kind; n: number; why?: string }
  | { type: "everySecond"; min: number }
  | { type: "recovery"; maxSeconds: number }
  | { type: "readYourWrites" }
  | { type: "noWrongData" }
  | { type: "realUsersBlocked"; max: number };

export type Metrics = {
  successRate: number;
  p99: number;
  cost: number;
  counts: Partial<Record<Kind, number>>;
  staleRate: number;
  wrongRate: number;
  blockedRate: number;
  worstSecond?: number;
  recovery?: number | null;
};

export type Check = { constraint: Constraint; label: string; ok: boolean; message: string | null };

const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(/\.0$/, "")}%`;
const plural = (kind: Kind, n: number) => {
  const l = SPECS[kind].label;
  return n === 1 ? l : l.endsWith("s") ? l : `${l}s`;
};

export function describe(c: Constraint): string {
  switch (c.type) {
    case "successRate":
      return `${pct(c.min)} of real requests succeed`;
    case "p99":
      return `p99 latency ≤ ${c.maxMs} ms`;
    case "budget":
      return `Costs ≤ $${c.maxUsd.toLocaleString("en-US")}/month`;
    case "minNodes":
      return `At least ${c.n} ${plural(c.kind, c.n)}`;
    case "maxNodes":
      return `At most ${c.n} ${plural(c.kind, c.n)}`;
    case "everySecond":
      return `Every second serves ≥ ${pct(c.min)}`;
    case "recovery":
      return `Back to normal within ${c.maxSeconds} s`;
    case "readYourWrites":
      return "New items work the moment they're created";
    case "noWrongData":
      return "Nobody gets someone else's data";
    case "realUsersBlocked":
      return `≤ ${pct(c.max)} of real users rate-limited`;
  }
}

function check(c: Constraint, m: Metrics): string | null {
  switch (c.type) {
    case "successRate":
      return m.successRate >= c.min
        ? null
        : `${pct(m.successRate)} of real requests succeeded. This test needs ${pct(c.min)}.`;
    case "p99":
      return m.p99 <= c.maxMs ? null : `p99 latency is ${m.p99} ms. This test needs ≤ ${c.maxMs} ms.`;
    case "budget":
      return m.cost <= c.maxUsd
        ? null
        : `This design costs $${m.cost.toLocaleString("en-US")}/month, over the $${c.maxUsd.toLocaleString("en-US")} budget.`;
    case "minNodes": {
      const n = m.counts[c.kind] ?? 0;
      return n >= c.n ? null : `You have ${n} ${plural(c.kind, n)}; this needs at least ${c.n}.${c.why ? ` ${c.why}` : ""}`;
    }
    case "maxNodes": {
      const n = m.counts[c.kind] ?? 0;
      return n <= c.n ? null : `You're using ${n} ${plural(c.kind, n)}; this allows ${c.n}.${c.why ? ` ${c.why}` : ""}`;
    }
    case "everySecond":
      return (m.worstSecond ?? 1) >= c.min
        ? null
        : `During the incident, the worst second served only ${pct(m.worstSecond ?? 0)}. Every second needs ${pct(c.min)}.`;
    case "recovery":
      if (m.recovery === null) return "It never recovered: requests were still failing when the test ended.";
      return (m.recovery ?? 0) <= c.maxSeconds
        ? null
        : `It took ${m.recovery} s to recover. This test needs ${c.maxSeconds} s or less.`;
    case "readYourWrites":
      return m.staleRate <= 0.0001
        ? null
        : `${pct(m.staleRate, 2)} of reads were 404s for items that had just been created.`;
    case "noWrongData":
      return m.wrongRate <= 0.0001 ? null : `${pct(m.wrongRate)} of reads returned another item's data.`;
    case "realUsersBlocked":
      return m.blockedRate <= c.max
        ? null
        : `${pct(m.blockedRate)} of real users' requests were rate-limited (429). Keep it under ${pct(c.max)}.`;
  }
}

export function grade(m: Metrics, constraints: Constraint[]): Check[] {
  return constraints.map((c) => {
    const message = check(c, m);
    return { constraint: c, label: describe(c), ok: message === null, message };
  });
}
