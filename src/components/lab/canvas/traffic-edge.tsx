"use client";

import { BaseEdge, EdgeLabelRenderer, getBezierPath, type Edge, type EdgeProps } from "@xyflow/react";
import { memo } from "react";
import { compact } from "./meta";

export type TrafficEdgeData = {
  /** Requests a second on this wire during the current frame of a test. */
  rps?: number;
  failing?: boolean;
};

export type TrafficFlowEdge = Edge<TrafficEdgeData, "traffic">;

function TrafficEdgeView(props: EdgeProps<TrafficFlowEdge>) {
  const { sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, data, selected, markerEnd } = props;
  const [path, lx, ly] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const rps = data?.rps;
  const active = rps !== undefined;
  const color = data?.failing ? "var(--err)" : active && rps > 0 ? "var(--req)" : selected ? "var(--accent)" : "var(--border-strong)";
  const width = active && rps > 0 ? Math.min(7, 1.5 + Math.log10(rps + 1) * 1.1) : selected ? 2 : 1.5;
  // More traffic: more dots, moving faster.
  const dots = active && rps > 0 ? Math.min(5, 1 + Math.floor(Math.log10(rps + 1))) : 0;
  const dur = active && rps > 0 ? Math.max(0.6, 2.6 - Math.log10(rps + 1) * 0.4) : 0;

  return (
    <>
      <BaseEdge path={path} markerEnd={markerEnd} style={{ stroke: color, strokeWidth: width, transition: "stroke-width 150ms" }} />
      {Array.from({ length: dots }, (_, i) => (
        <circle key={i} r={Math.min(4.5, 2 + width / 3)} fill={color}>
          <animateMotion dur={`${dur}s`} begin={`${(i * dur) / dots}s`} repeatCount="indefinite" path={path} />
        </circle>
      ))}
      {active && rps > 0 && (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan pointer-events-none absolute rounded-md border border-line bg-surface px-1.5 py-0.5 font-mono text-[10px] text-muted"
            style={{ transform: `translate(-50%, -50%) translate(${lx}px, ${ly}px)`, color: data?.failing ? "var(--err)" : undefined }}
          >
            {compact(rps)}/s
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

export const TrafficEdge = memo(TrafficEdgeView);
