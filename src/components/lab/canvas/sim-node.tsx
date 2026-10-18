"use client";

import { Handle, Position, type Node, type NodeProps } from "@xyflow/react";
import { memo } from "react";
import { ALLOWED_TARGETS, HOT_UTIL, type NodeStat } from "@/sim";
import type { LabNode } from "@/lib/lab/types";
import { cn } from "@/lib/utils";
import { KIND_META, compact } from "./meta";

export type SimNodeData = {
  node: LabNode;
  title: string;
  sub: string;
  stat?: NodeStat;
};

export type SimFlowNode = Node<SimNodeData, "sim">;

function utilTone(stat: NodeStat | undefined) {
  if (!stat) return null;
  if (stat.down) return "err";
  if (stat.util >= 1) return "err";
  if (stat.util >= HOT_UTIL) return "warn";
  return "ok";
}

const toneRing = {
  ok: "border-ok/60",
  warn: "border-warn/70",
  err: "border-err/80 shadow-[0_0_0_3px_rgb(240_96_93/0.18)]",
};
const toneText = { ok: "text-ok", warn: "text-warn", err: "text-err" };

/** The small line under the title while a test runs: what this kind of node is busy with. */
function statLine(node: LabNode, stat: NodeStat) {
  if (stat.down) return "no traffic";
  if (node.kind === "ws" && stat.conns) return `${compact(stat.conns)} conns · ${compact(stat.load)}/s`;
  if (node.kind === "worker") return `${compact(stat.load)} jobs/s`;
  return `${compact(stat.load)}/s`;
}

function backlogLine(node: LabNode, stat: NodeStat) {
  if ((node.kind === "worker" || node.kind === "queue") && (stat.backlog ?? 0) >= 1) return `${compact(stat.backlog ?? 0)} waiting`;
  if (node.kind === "db" && (stat.shards ?? 1) > 1 && stat.hotUtil !== undefined && stat.hotUtil >= HOT_UTIL) return "hot shard";
  return null;
}

function SimNodeView({ data, selected }: NodeProps<SimFlowNode>) {
  const { node, title, sub, stat } = data;
  const meta = KIND_META[node.kind];
  const Icon = meta.icon;
  const tone = utilTone(stat);
  const hasInput = node.kind !== "client";
  const hasOutput = ALLOWED_TARGETS[node.kind].length > 0;
  const showStat = stat && node.kind !== "client" && Number.isFinite(stat.cap);

  return (
    <div
      className={cn(
        "relative w-[176px] rounded-xl border bg-surface px-3 py-2.5 shadow-card transition-[border-color,box-shadow]",
        tone ? toneRing[tone] : "border-line-strong",
        selected && "ring-2 ring-accent/70",
        node.role === "replica" && !tone && "border-dashed",
      )}
    >
      {hasInput && (
        <Handle
          type="target"
          position={Position.Left}
          className="!size-3 !border-2 !border-line-strong !bg-surface-3"
        />
      )}
      <div className="flex items-center gap-2.5">
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg border border-line bg-surface-2",
            node.kind === "client" ? "text-req" : "text-fg",
          )}
        >
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] leading-tight font-semibold text-fg">{title}</p>
          <p className="truncate font-mono text-[10.5px] leading-tight text-subtle">{sub}</p>
        </div>
      </div>
      {showStat && (
        <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-1.5 font-mono text-[10.5px]">
          <span className="text-muted">{statLine(node, stat)}</span>
          <span className={cn("font-semibold", tone && toneText[tone])}>
            {stat.down ? "DOWN" : `${Math.round(stat.util * 100)}%`}
          </span>
        </div>
      )}
      {showStat && !stat.down && backlogLine(node, stat) && (
        <p className="mt-1 font-mono text-[10.5px] font-semibold text-warn">{backlogLine(node, stat)}</p>
      )}
      {showStat && !stat.down && (
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-surface-3">
          <div
            className={cn(
              "h-full rounded-full transition-[width] duration-150",
              tone === "err" ? "bg-err" : tone === "warn" ? "bg-warn" : "bg-ok",
            )}
            style={{ width: `${Math.min(100, stat.util * 100)}%` }}
          />
        </div>
      )}
      {stat?.down && (
        <span className="absolute -top-2 -right-2 rounded-full border border-err/40 bg-err px-1.5 py-0.5 font-mono text-[9.5px] font-bold text-white">
          DOWN
        </span>
      )}
      {hasOutput && (
        <Handle
          type="source"
          position={Position.Right}
          className="!size-3 !border-2 !border-accent !bg-surface"
        />
      )}
    </div>
  );
}

export const SimNode = memo(SimNodeView);
