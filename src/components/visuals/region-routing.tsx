"use client";

import { useState } from "react";
import { Power } from "lucide-react";
import { cn } from "@/lib/utils";
import { Segmented, Stat, VisualButton, VisualCanvas, VisualShell, useVisualTracker } from "./visual-shell";

type Mode = "passive" | "active";

const REGIONS = [
  { id: "mum", name: "Mumbai", x: 120 },
  { id: "sin", name: "Singapore", x: 320 },
  { id: "fra", name: "Frankfurt", x: 520 },
] as const;
type RegionId = (typeof REGIONS)[number]["id"];

const USERS: { name: string; x: number; eu?: boolean; ms: Record<RegionId, number> }[] = [
  { name: "Delhi", x: 70, ms: { mum: 25, sin: 70, fra: 130 } },
  { name: "Dubai", x: 230, ms: { mum: 45, sin: 95, fra: 100 } },
  { name: "Jakarta", x: 390, ms: { mum: 110, sin: 20, fra: 190 } },
  { name: "Berlin", x: 550, eu: true, ms: { mum: 130, sin: 170, fra: 15 } },
];

const FAILOVER_ORDER: RegionId[] = ["mum", "sin", "fra"];

export function RegionRouting() {
  const track = useVisualTracker("region-routing");
  const [mode, setMode] = useState<Mode>("active");
  const [down, setDown] = useState<RegionId[]>([]);
  const [residency, setResidency] = useState(false);

  const up = (r: RegionId) => !down.includes(r);

  function serve(u: (typeof USERS)[number]): RegionId | null {
    if (residency && u.eu) return up("fra") ? "fra" : null;
    if (mode === "active") {
      const cands = REGIONS.map((r) => r.id).filter(up);
      if (!cands.length) return null;
      return cands.reduce((a, b) => (u.ms[a] <= u.ms[b] ? a : b));
    }
    // active-passive: Mumbai is primary; Singapore is the warm standby, then Frankfurt.
    return FAILOVER_ORDER.find(up) ?? null;
  }

  const result = USERS.map((u) => ({ u, r: serve(u) }));
  const served = result.filter((x) => x.r);
  const avg = served.length ? Math.round(served.reduce((a, x) => a + x.u.ms[x.r!], 0) / served.length) : 0;
  const primaryDown = !up("mum");
  const nameOf = (id: RegionId) => REGIONS.find((r) => r.id === id)!.name;

  function toggle(id: RegionId) {
    track("fail_region", `${id}:${up(id) ? "down" : "up"}`);
    setDown((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]));
  }

  return (
    <VisualShell
      title="Route users to a region, then break one"
      hint="Each user connects to the region the mode allows. Fail a region and watch who is re-routed, who slows down, and who loses service."
    >
      <div className="flex flex-wrap items-center gap-2">
        <Segmented
          label="Deployment mode"
          value={mode}
          onChange={(v) => {
            track("mode", v);
            setMode(v);
          }}
          options={[
            { value: "passive", label: "Active-passive" },
            { value: "active", label: "Active-active" },
          ]}
        />
        <label className="flex items-center gap-2 text-[12.5px] text-muted">
          <input
            type="checkbox"
            checked={residency}
            onChange={(e) => {
              track("residency", e.target.checked);
              setResidency(e.target.checked);
            }}
            className="size-3.5 accent-[var(--accent)]"
          />
          EU data must stay in the EU
        </label>
      </div>

      <div className="mt-3">
        <VisualCanvas w={640} h={250} label="Users connected to the regions that serve them">
          {result.map(({ u, r }) => {
            const rx = r ? REGIONS.find((g) => g.id === r)!.x : u.x;
            const slow = r && u.ms[r] > 100;
            return r ? (
              <line key={u.name} x1={u.x} y1={186} x2={rx} y2={92} stroke={slow ? "var(--warn)" : "var(--res)"} strokeWidth={1.8} strokeDasharray={slow ? "5 4" : undefined} opacity={0.9} />
            ) : (
              <line key={u.name} x1={u.x} y1={186} x2={u.x} y2={140} stroke="var(--err)" strokeWidth={1.8} strokeDasharray="2 3" />
            );
          })}
          {REGIONS.map((g) => {
            const ok = up(g.id);
            const isStandby = mode === "passive" && g.id !== "mum" && ok;
            const n = result.filter((x) => x.r === g.id).length;
            return (
              <g key={g.id} opacity={ok ? 1 : 0.55}>
                <rect x={g.x - 68} y={36} width={136} height={58} rx={12} fill="var(--surface-2)" stroke={!ok ? "var(--err)" : n ? "var(--accent)" : "var(--border-strong)"} strokeWidth={1.5} strokeDasharray={!ok || (isStandby && !n) ? "5 4" : undefined} />
                <text x={g.x} y={58} textAnchor="middle" fontSize={13} fontWeight={600} fill="var(--fg)">
                  {g.name}
                </text>
                <text x={g.x} y={78} textAnchor="middle" fontSize={10.5} fill={!ok ? "var(--err)" : "var(--fg-subtle)"} fontFamily="var(--font-geist-mono)">
                  {!ok ? "DOWN" : n ? `serving ${n}` : isStandby ? "standby" : "idle"}
                </text>
              </g>
            );
          })}
          {result.map(({ u, r }) => (
            <g key={u.name}>
              <circle cx={u.x} cy={198} r={12} fill="var(--surface-2)" stroke={r ? "var(--border-strong)" : "var(--err)"} />
              <text x={u.x} y={202} textAnchor="middle" fontSize={11} fill="var(--fg)">
                {u.eu ? "EU" : "IN"}
              </text>
              <text x={u.x} y={226} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--fg)">
                {u.name}
              </text>
              <text x={u.x} y={241} textAnchor="middle" fontSize={10} fontFamily="var(--font-geist-mono)" fill={r ? "var(--fg-subtle)" : "var(--err)"}>
                {r ? `${u.ms[r]} ms` : "no service"}
              </text>
            </g>
          ))}
        </VisualCanvas>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {REGIONS.map((g) => (
          <VisualButton key={g.id} onClick={() => toggle(g.id)} tone={up(g.id) ? "err" : "ok"} pressed={!up(g.id)}>
            <Power className="size-3.5" /> {up(g.id) ? `Fail ${g.name}` : `Restore ${g.name}`}
          </VisualButton>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Average latency" value={served.length ? `${avg} ms` : "–"} tone={avg > 100 ? "warn" : "ok"} />
        <Stat label="Users served" value={`${served.length} / ${USERS.length}`} tone={served.length < USERS.length ? "err" : "ok"} />
        <Stat label="Regions up" value={`${3 - down.length} / 3`} />
      </div>
      <p className={cn("mt-3 text-[13px] leading-relaxed", primaryDown && mode === "passive" ? "text-warn" : "text-subtle")}>
        {mode === "passive"
          ? primaryDown
            ? `Failover: ${nameOf(FAILOVER_ORDER.find(up) ?? "fra")} was promoted. Anything the old primary had not yet replicated is lost, and every user now pays the distance to that region.`
            : "Everyone travels to Mumbai, so Berlin and Jakarta pay 130 and 110 ms on every request. The standby regions sit idle, costing money."
          : "Each user goes to the nearest healthy region, so latency is low. The price is that all regions accept writes, so the same row can be changed in two places at once and must be reconciled."}
        {residency && " With residency on, Berlin is pinned to Frankfurt even when that is slower, and loses service if Frankfurt is down."}
      </p>
    </VisualShell>
  );
}
