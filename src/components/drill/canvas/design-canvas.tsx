"use client";

import "@xyflow/react/dist/style.css";
import {
  Background,
  BackgroundVariant,
  Controls,
  MarkerType,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  type Connection,
  type EdgeChange,
  type NodeChange,
} from "@xyflow/react";
import { AnimatePresence, motion } from "motion/react";
import { CircleAlert, Plus } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useStore } from "zustand";
import { ALLOWED_TARGETS, type EvalResult, type Kind } from "@/sim";
import { track } from "@/lib/analytics";
import type { DrillStore } from "@/lib/drill/store";
import type { DrillNode } from "@/lib/drill/types";
import { cn } from "@/lib/utils";
import { KIND_META, newId, nodeSub, nodeTitle, placeNew } from "./meta";
import { SimNode, type SimFlowNode } from "./sim-node";
import { TrafficEdge, type TrafficFlowEdge } from "./traffic-edge";

const nodeTypes = { sim: SimNode };

function omit<T>(o: Record<string, T>, key: string) {
  const next = { ...o };
  delete next[key];
  return next;
}
const edgeTypes = { traffic: TrafficEdge };
const DND_TYPE = "application/x-wirebox-kind";

/** Why a wire from `a` to `b` isn't allowed, in words a learner can act on. */
export function wireProblem(a: Kind, b: Kind): string | null {
  if (ALLOWED_TARGETS[a].includes(b)) return null;
  const A = KIND_META[a].label;
  const B = KIND_META[b].label;
  if (a === "cache" || a === "db" || a === "storage" || a === "external" || a === "search")
    return `${A} only answers requests; it never sends them. Wire from an API server (or a worker) to it instead.`;
  if (a === "client" && (b === "db" || b === "cache"))
    return `Users can't reach the ${b === "db" ? "database" : "cache"} directly: anyone could read or delete everything. Requests go through an API server.`;
  if (a === "client" && (b === "queue" || b === "worker" || b === "external" || b === "storage" || b === "search" || b === "pubsub"))
    return `Users can't reach the ${B.toLowerCase()} directly. Their requests go to an API server (or a gateway), which calls it.`;
  if (a === "server" && b === "worker")
    return "Servers don't call workers directly. Put a queue between them: the request returns as soon as the job is saved, and workers pick it up at their own pace.";
  if (a === "queue") return "A queue only hands work to workers.";
  if (a === "worker" && (b === "server" || b === "lb" || b === "limiter"))
    return "Workers pull jobs and call data stores or outside APIs. They don't send requests to servers.";
  if (a === "pubsub" && b === "db") return "A broker passes messages between gateways and workers; it doesn't write to a database.";
  if (a === "ws" && (b === "lb" || b === "limiter")) return "Wires point the way requests travel. The gateway sits behind those, not in front of them.";
  if ((a === "lb" || a === "limiter") && (b === "db" || b === "cache"))
    return `A ${A.toLowerCase()} only forwards HTTP requests to API servers. The server is what talks to the ${b === "db" ? "database" : "cache"}.`;
  if (a === "server" && b === "server") return "Servers don't hand requests to each other here. Put a load balancer in front of both.";
  if (b === "client") return "Users only send requests. Wires point the way requests travel: from users toward the data.";
  if (a === "server" && (b === "lb" || b === "limiter"))
    return `Wires point the way requests travel. The ${B.toLowerCase()} sits in front of the servers, so wire it to them.`;
  if (a === "lb" && b === "limiter") return "Put the rate limiter first: Users → rate limiter → load balancer, so abusive traffic is dropped as early as possible.";
  if (a === b) return `Two ${A.toLowerCase()}s in a row don't add anything here.`;
  return `${A} can't send requests to ${B}.`;
}

type Props = {
  drill: string;
  store: DrillStore;
  palette: Kind[];
  /** A second database becomes a read replica (steps that teach replication). */
  replicas?: boolean;
  dbLabel: string;
  selected: string | null;
  onSelect: (id: string | null) => void;
  /** The current frame of a load test, if one is playing or finished. */
  frame: EvalResult | null;
  locked?: boolean;
  className?: string;
};

export function DesignCanvas(props: Props) {
  return (
    <ReactFlowProvider>
      <CanvasInner {...props} />
    </ReactFlowProvider>
  );
}

function CanvasInner({ drill, store, palette, replicas = true, dbLabel, selected, onSelect, frame, locked, className }: Props) {
  const graph = useStore(store, (s) => s.graph);
  const { addNode, addEdge, removeEdges, removeNodes, moveNode } = store.getState();
  const flow = useReactFlow();
  const wrapper = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number }>>({});
  const [dragging, setDragging] = useState<Record<string, { x: number; y: number }>>({});
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string } | null>(null);

  const say = useCallback((text: string) => setToast({ id: Date.now(), text }), []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4200);
    return () => clearTimeout(t);
  }, [toast]);

  const byId = useMemo(() => new Map(graph.nodes.map((n) => [n.id, n])), [graph.nodes]);

  const nodes: SimFlowNode[] = useMemo(
    () =>
      graph.nodes.map((n) => ({
        id: n.id,
        type: "sim" as const,
        position: dragging[n.id] ?? { x: n.x, y: n.y },
        data: { node: n, title: nodeTitle(n, dbLabel), sub: nodeSub(n), stat: frame?.nodes[n.id] },
        selected: n.id === selected,
        measured: measured[n.id],
        deletable: n.kind !== "client" && !locked,
      })),
    [graph.nodes, dragging, dbLabel, frame, selected, measured, locked],
  );

  const edges: TrafficFlowEdge[] = useMemo(
    () =>
      graph.edges.map((e) => {
        const rps = frame ? (frame.edges[`${e.from}>${e.to}`] ?? 0) : undefined;
        const s = frame?.nodes[e.to];
        const src = frame?.nodes[e.from];
        const failing = !!frame && ((s && (s.down || s.util >= 1)) || (src && src.down));
        return {
          id: e.id,
          source: e.from,
          target: e.to,
          type: "traffic" as const,
          selected: e.id === selectedEdge,
          deletable: !locked,
          data: { rps, failing: !!failing },
          markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: failing ? "var(--err)" : "var(--border-strong)" },
        };
      }),
    [graph.edges, frame, selectedEdge, locked],
  );

  const onNodesChange = useCallback(
    (changes: NodeChange<SimFlowNode>[]) => {
      const removed: string[] = [];
      for (const c of changes) {
        if (c.type === "dimensions" && c.dimensions) {
          const d = c.dimensions;
          setMeasured((m) => (m[c.id]?.width === d.width && m[c.id]?.height === d.height ? m : { ...m, [c.id]: d }));
        } else if (c.type === "position" && c.position) {
          if (c.dragging) {
            const p = c.position;
            setDragging((d) => ({ ...d, [c.id]: p }));
          } else {
            moveNode(c.id, Math.round(c.position.x), Math.round(c.position.y));
            setDragging((d) => omit(d, c.id));
          }
        } else if (c.type === "select") {
          if (c.selected) {
            onSelect(c.id);
            setSelectedEdge(null);
          } else if (c.id === selected) onSelect(null);
        } else if (c.type === "remove") {
          removed.push(c.id);
        }
      }
      if (removed.length) {
        for (const id of removed) {
          const n = byId.get(id);
          if (n) track("drill_component_removed", { drill, kind: n.kind });
        }
        removeNodes(removed);
        if (selected && removed.includes(selected)) onSelect(null);
      }
    },
    [byId, drill, moveNode, onSelect, removeNodes, selected],
  );

  // Positions committed on drag stop clear the transient drag state.
  const onNodeDragStop = useCallback(
    (_: unknown, node: SimFlowNode) => {
      moveNode(node.id, Math.round(node.position.x), Math.round(node.position.y));
      setDragging((d) => omit(d, node.id));
    },
    [moveNode],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange<TrafficFlowEdge>[]) => {
      const removed = changes.filter((c) => c.type === "remove").map((c) => c.id);
      if (removed.length) removeEdges(removed);
      for (const c of changes) {
        if (c.type === "select") setSelectedEdge(c.selected ? c.id : null);
      }
    },
    [removeEdges],
  );

  const onConnect = useCallback(
    (c: Connection) => {
      if (!c.source || !c.target || c.source === c.target) return;
      const a = byId.get(c.source);
      const b = byId.get(c.target);
      if (!a || !b) return;
      const problem = wireProblem(a.kind, b.kind);
      track("drill_wire_added", { drill, from: a.kind, to: b.kind, ok: !problem });
      if (problem) return say(problem);
      if (graph.edges.some((e) => e.from === a.id && e.to === b.id)) return say("Those two are already wired.");
      addEdge(a.id, b.id);
    },
    [addEdge, byId, graph.edges, drill, say],
  );

  const add = useCallback(
    (kind: Kind, at?: { x: number; y: number }) => {
      const nodes = store.getState().graph.nodes;
      const hasPrimary = nodes.some((n) => n.kind === "db" && (n.role ?? "primary") === "primary");
      const n: DrillNode = {
        id: newId(kind),
        kind,
        ...(at ?? placeNew(kind, nodes)),
        ...(kind === "server" ? { size: "s" as const } : {}),
        ...(kind === "db" ? { role: hasPrimary && replicas ? ("replica" as const) : ("primary" as const) } : {}),
      };
      addNode(n);
      onSelect(n.id);
      track("drill_component_added", { drill, kind });
      if (!at) requestAnimationFrame(() => flow.fitView({ padding: 0.25, duration: 300, maxZoom: 1.1 }));
    },
    [addNode, flow, drill, onSelect, replicas, store],
  );

  const onDrop = useCallback(
    (e: DragEvent) => {
      e.preventDefault();
      const kind = e.dataTransfer.getData(DND_TYPE) as Kind;
      if (!kind || !palette.includes(kind)) return;
      const p = flow.screenToFlowPosition({ x: e.clientX, y: e.clientY });
      add(kind, { x: Math.round(p.x - 88), y: Math.round(p.y - 30) });
    },
    [add, flow, palette],
  );

  const items = palette.filter((k) => k !== "client");

  return (
    <div ref={wrapper} className={cn("relative h-full w-full bg-sunken", className)}>
      <ReactFlow<SimFlowNode, TrafficFlowEdge>
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeDragStop={onNodeDragStop}
        onConnect={onConnect}
        onPaneClick={() => {
          onSelect(null);
          setSelectedEdge(null);
        }}
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = "copy";
        }}
        onDrop={onDrop}
        isValidConnection={(c) => c.source !== c.target}
        deleteKeyCode={locked ? null : ["Backspace", "Delete"]}
        nodesDraggable={!locked}
        nodesConnectable={!locked}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
        minZoom={0.3}
        maxZoom={1.75}
        proOptions={{ hideAttribution: true }}
        connectionRadius={28}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--border-strong)" />
        <Controls showInteractive={false} position="bottom-left" />
      </ReactFlow>

      {!locked && items.length > 0 && (
        <div className="absolute top-3 left-3 z-10 flex max-w-[calc(100%-1.5rem)] flex-wrap gap-1.5 rounded-xl border border-line bg-surface/90 p-1.5 shadow-card backdrop-blur">
          <span className="hidden self-center px-1.5 font-mono text-[10px] tracking-wider text-subtle uppercase sm:inline">Add</span>
          {items.map((kind) => {
            const m = KIND_META[kind];
            const Icon = m.icon;
            return (
              <button
                key={kind}
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_TYPE, kind);
                  e.dataTransfer.effectAllowed = "copy";
                }}
                onClick={() => add(kind)}
                title={`${m.label}: ${m.blurb} Click to add, or drag onto the canvas.`}
                className="flex items-center gap-1.5 rounded-lg border border-line bg-surface-2 px-2 py-1.5 text-[12px] font-medium text-fg transition-colors hover:border-accent/50 hover:bg-accent-soft"
              >
                <Plus className="size-3 text-subtle" />
                <Icon className="size-3.5 text-accent" />
                {kind === "db" ? "Database" : m.label}
              </button>
            );
          })}
        </div>
      )}

      {graph.nodes.length <= 1 && !locked && (
        <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 mx-auto w-fit max-w-[90%] rounded-xl border border-line bg-surface/90 px-3 py-2 text-center text-[12.5px] text-muted backdrop-blur">
          Add components from the bar above, then drag from a node&apos;s right handle to another node to wire them.
        </div>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            key={toast.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            role="status"
            className="absolute inset-x-0 bottom-4 z-20 mx-auto flex w-fit max-w-[min(440px,92%)] items-start gap-2 rounded-xl border border-err/40 bg-surface px-3.5 py-2.5 text-[13px] text-fg shadow-card"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-err" />
            <span>{toast.text}</span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
