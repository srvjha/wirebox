"use client";

import { useState, type ReactNode } from "react";
import { BookOpen, Layers, PenLine, RotateCcw, Trash2 } from "lucide-react";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { mulberry32 } from "./algo-hash";
import { SimButton, Stat, VisualFrame } from "./algo-kit";
import {
  L0_MAX,
  L0_STALL,
  L1_MAX,
  MEM_CAP,
  compactAll,
  diskEntries,
  emptyLsm,
  liveKeys,
  put,
  read,
  type Entry,
  type Lsm,
  type ReadResult,
  type SSTable,
} from "./lsm-core";

/**
 * Write-heavy Gatepass gate scans going into an LSM tree. Writes land in the
 * memtable, flush to immutable L0 SSTables, and compaction merges them down.
 * Reads walk memtable → L0 (newest first) → L1 → L2, using each table's
 * Bloom filter to skip files that cannot hold the key.
 */

const VISUAL = "lsm-tree-sim";
const KEYS = Array.from({ length: 20 }, (_, i) => `t${String(i + 1).padStart(2, "0")}`);

function initial(): Lsm {
  const rnd = mulberry32(19);
  let s = emptyLsm();
  for (let i = 0; i < 22; i++) s = put(s, KEYS[Math.floor(rnd() * KEYS.length)], `v${s.seq + 1}`);
  return { ...s, events: [] };
}
const START = initial();

function Chip({ e, hot }: { e: Entry; hot?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-none",
        e.value === null ? "border-err/40 text-err line-through" : "border-line text-muted",
        hot && "border-accent bg-accent-soft text-fg",
      )}
    >
      {e.key}
      <span className="ml-1 text-subtle">{e.value === null ? "✕" : e.value}</span>
    </span>
  );
}

function TableCard({ t, label, probe }: { t: SSTable; label: string; probe?: ReadResult }) {
  const step = probe?.steps.find((s) => s.where.endsWith(`#${t.id}`));
  return (
    <div
      className={cn(
        "min-w-0 rounded-lg border bg-bg p-2 transition-colors",
        !step && "border-line",
        step?.outcome === "bloom-skip" && "border-line opacity-60",
        step?.outcome === "searched-miss" && "border-warn/60",
        step?.outcome === "hit" && "border-ok/70",
      )}
    >
      <p className="mb-1.5 flex items-center justify-between gap-2 font-mono text-[10px] text-subtle uppercase">
        <span>{label}</span>
        {step && (
          <span className={cn(step.outcome === "hit" ? "text-ok" : step.outcome === "searched-miss" ? "text-warn" : "text-subtle")}>
            {step.outcome === "bloom-skip" ? "bloom: skip" : step.outcome === "hit" ? "found" : "read, not here"}
          </span>
        )}
      </p>
      <div className="flex flex-wrap gap-1">
        {t.entries.map((e) => (
          <Chip key={e.key} e={e} hot={probe?.key === e.key && step?.outcome === "hit"} />
        ))}
      </div>
    </div>
  );
}

function Level({ name, hint, children }: { name: string; hint: string; children: ReactNode }) {
  return (
    <div className="grid gap-2 border-t border-line pt-3 sm:grid-cols-[92px_minmax(0,1fr)]">
      <div>
        <p className="font-mono text-[12px] font-semibold text-fg">{name}</p>
        <p className="text-[11px] leading-snug text-subtle">{hint}</p>
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function LsmTreeSim() {
  const [s, setS] = useState<Lsm>(START);
  const [probe, setProbe] = useState<ReadResult | null>(null);
  const [readKey, setReadKey] = useState(KEYS[4]);

  const stalled = s.l0.length >= L0_STALL;
  const live = liveKeys(s);
  const onDisk = diskEntries(s);
  const tables = s.l0.length + (s.l1 ? 1 : 0) + (s.l2 ? 1 : 0);
  const wa = s.userWrites ? s.diskWrites / s.userWrites : 0;

  const randKey = () => KEYS[Math.floor(Math.random() * KEYS.length)];

  function write(n: number) {
    setProbe(null);
    setS((cur) => {
      let next = cur;
      for (let i = 0; i < n; i++) next = put(next, randKey(), `v${next.seq + 1}`);
      return next;
    });
    track("visual_interacted", { visual: VISUAL, control: n > 1 ? "write_10" : "write", value: s.userWrites + n });
  }

  function del() {
    setProbe(null);
    const key = randKey();
    setS((cur) => put(cur, key, null));
    track("visual_interacted", { visual: VISUAL, control: "delete", value: key });
  }

  function doRead(key: string) {
    setReadKey(key);
    const r = read(s, key);
    setProbe(r);
    track("visual_interacted", { visual: VISUAL, control: "read", value: r.diskReads });
  }

  return (
    <VisualFrame
      eyebrow="Simulation · LSM tree"
      title="Gate scans flowing into an LSM tree"
      caption={`Keys are ticket IDs; each write is a new version. The memtable holds ${MEM_CAP} entries, L0 compacts after ${L0_MAX} tables, and L1 merges into L2 once it holds more than ${L1_MAX}. Struck-through entries are deletes (tombstones).`}
    >
      <div className="flex flex-wrap gap-2">
        <SimButton primary onClick={() => write(1)} disabled={stalled}>
          <PenLine className="size-3.5" /> Write
        </SimButton>
        <SimButton onClick={() => write(10)} disabled={stalled}>
          Write ×10
        </SimButton>
        <SimButton onClick={del} disabled={stalled}>
          <Trash2 className="size-3.5" /> Delete a key
        </SimButton>
        <SimButton
          onClick={() => {
            setS((cur) => ({ ...cur, autoCompact: !cur.autoCompact }));
            track("visual_interacted", { visual: VISUAL, control: "auto_compact", value: !s.autoCompact });
          }}
          className={cn(!s.autoCompact && "border-warn/50 text-warn")}
        >
          <Layers className="size-3.5" /> Auto-compaction: {s.autoCompact ? "on" : "off"}
        </SimButton>
        <SimButton
          onClick={() => {
            setProbe(null);
            setS((cur) => compactAll(cur));
            track("visual_interacted", { visual: VISUAL, control: "compact_now", value: s.l0.length });
          }}
          disabled={!s.l0.length && !s.l1}
        >
          Compact now
        </SimButton>
        <SimButton
          onClick={() => {
            setS(START);
            setProbe(null);
            track("visual_interacted", { visual: VISUAL, control: "reset", value: true });
          }}
        >
          <RotateCcw className="size-3.5" /> Reset
        </SimButton>
      </div>

      {stalled && (
        <p className="mt-3 rounded-lg border border-err/30 bg-err/10 px-3 py-2 text-[13px] text-err" role="status">
          Write stall. {s.l0.length} L0 tables are waiting and every read has to check all of them, so the database stops accepting writes until compaction catches up. Press “Compact now”.
        </p>
      )}

      <div className="mt-4 space-y-3">
        <Level name="Memtable" hint={`RAM, sorted · ${s.mem.length}/${MEM_CAP}`}>
          <div
            className={cn(
              "flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-dashed p-2",
              probe?.steps[0]?.outcome === "hit" ? "border-ok/70" : "border-line-strong",
            )}
          >
            {s.mem.length ? s.mem.map((e) => <Chip key={e.key} e={e} hot={probe?.key === e.key} />) : <span className="text-[12px] text-subtle">empty</span>}
          </div>
        </Level>
        <Level name="L0" hint="flushed files, may overlap · newest first">
          {s.l0.length ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {s.l0.map((t) => (
                <TableCard key={t.id} t={t} label={`SSTable #${t.id}`} probe={probe ?? undefined} />
              ))}
            </div>
          ) : (
            <p className="text-[12px] text-subtle">no tables</p>
          )}
        </Level>
        <Level name="L1" hint="one sorted run">
          {s.l1 ? <TableCard t={s.l1} label={`SSTable #${s.l1.id}`} probe={probe ?? undefined} /> : <p className="text-[12px] text-subtle">empty</p>}
        </Level>
        <Level name="L2" hint="bottom level, oldest data">
          {s.l2 ? <TableCard t={s.l2} label={`SSTable #${s.l2.id}`} probe={probe ?? undefined} /> : <p className="text-[12px] text-subtle">empty</p>}
        </Level>
      </div>

      <div className="mt-4 rounded-xl border border-line bg-surface-2 p-3">
        <p className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] tracking-wider text-subtle uppercase">
          <BookOpen className="size-3" /> Read a key
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={readKey}
            onChange={(e) => doRead(e.target.value)}
            aria-label="Key to read"
            className="h-8 rounded-lg border border-line bg-bg px-2 font-mono text-[13px] text-fg outline-none focus:border-accent/60"
          >
            {KEYS.map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </select>
          <SimButton onClick={() => doRead(readKey)}>Read</SimButton>
          <SimButton onClick={() => doRead(randKey())}>Read random</SimButton>
        </div>
        {probe && (
          <div className="mt-3" aria-live="polite">
            <ol className="flex flex-wrap items-center gap-1 font-mono text-[11.5px]">
              {probe.steps.map((st, i) => (
                <li key={st.where} className="flex items-center gap-1">
                  {i > 0 && <span className="text-subtle">→</span>}
                  <span
                    className={cn(
                      "rounded-md border px-1.5 py-0.5",
                      st.outcome === "hit" && "border-ok/50 text-ok",
                      st.outcome === "searched-miss" && "border-warn/50 text-warn",
                      (st.outcome === "miss" || st.outcome === "bloom-skip") && "border-line text-subtle",
                    )}
                  >
                    {st.where}
                    {st.outcome === "bloom-skip" ? " · skip" : st.outcome === "searched-miss" ? " · read" : st.outcome === "hit" ? " · hit" : ""}
                  </span>
                </li>
              ))}
            </ol>
            <p className="mt-2 text-[13px] text-muted">
              <span className="font-mono text-fg">{probe.key}</span> →{" "}
              {probe.value === undefined ? "not found" : probe.value === null ? "deleted (tombstone)" : <span className="font-mono text-ok">{probe.value}</span>}.{" "}
              {probe.diskReads} table read{probe.diskReads === 1 ? "" : "s"} from disk, {probe.bloomSkips} skipped by Bloom filters.
            </p>
          </div>
        )}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Your writes" value={s.userWrites} />
        <Stat label="Write amp." value={`${wa.toFixed(2)}×`} sub="entries written to disk ÷ yours" tone={wa > 2.5 ? "warn" : "default"} />
        <Stat label="Tables on disk" value={tables} sub="worst-case reads" tone={tables > 5 ? "err" : "default"} />
        <Stat label="Space amp." value={live ? `${(onDisk / live).toFixed(2)}×` : "–"} sub="entries on disk ÷ live keys" />
      </div>

      {s.events.length > 0 && (
        <ul className="mt-3 space-y-0.5 font-mono text-[11.5px] text-subtle" aria-live="polite">
          {s.events.slice(0, 3).map((e, i) => (
            <li key={`${i}-${e}`} className={i === 0 ? "text-muted" : undefined}>
              {e}
            </li>
          ))}
        </ul>
      )}
    </VisualFrame>
  );
}
