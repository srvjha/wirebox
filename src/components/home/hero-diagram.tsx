import { Box, Diagram, Packet, Tag, Text, Wire, type IconKind, type Pt } from "@/components/diagram/kit";
import { MotionGate } from "./motion-gate";

/**
 * The landing page's live architecture: fans -> rate limiter -> load balancer
 * -> three stateless API servers -> Redis + Postgres. Every 12 seconds API 2
 * fails its health check, the balancer routes around it, and it comes back.
 * Drawn twice (wide and tall) so labels stay readable on a phone.
 */

type Node = {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  sub?: string;
  icon: IconKind;
};
type Orientation = "wide" | "tall";

const H = 52;
export const CYCLE = 12; // seconds per failure/recovery loop

function layout(o: Orientation) {
  if (o === "wide") {
    const api = (y: number, n: number): Node => ({
      x: 468,
      y,
      w: 112,
      h: H,
      label: `API ${n}`,
      sub: "stateless",
      icon: "server",
    });
    return {
      W: 750,
      Ht: 330,
      fans: {
        x: 6,
        y: 139,
        w: 112,
        h: H,
        label: "Fans",
        sub: "12k req/s",
        icon: "user",
      } as Node,
      limiter: {
        x: 150,
        y: 139,
        w: 118,
        h: H,
        label: "Limiter",
        sub: "per IP",
        icon: "limiter",
      } as Node,
      lb: {
        x: 300,
        y: 139,
        w: 136,
        h: H,
        label: "Load balancer",
        sub: "least conns",
        icon: "lb",
      } as Node,
      apis: [api(49, 1), api(139, 2), api(229, 3)],
      redis: {
        x: 622,
        y: 84,
        w: 122,
        h: H,
        label: "Redis",
        sub: "cache",
        icon: "cache",
      } as Node,
      pg: {
        x: 622,
        y: 194,
        w: 122,
        h: H,
        label: "Postgres",
        sub: "primary",
        icon: "db",
      } as Node,
      reject: {
        from: [209, 165] as Pt,
        to: [209, 252] as Pt,
        tag: [209, 262] as Pt,
      },
      status: [375, 316] as Pt,
    };
  }
  const api = (x: number, n: number): Node => ({
    x,
    y: 296,
    w: 104,
    h: H,
    label: `API ${n}`,
    icon: "server",
  });
  return {
    W: 360,
    Ht: 508,
    fans: {
      x: 105,
      y: 8,
      w: 150,
      h: H,
      label: "Fans",
      sub: "12k req/s",
      icon: "user",
    } as Node,
    limiter: {
      x: 105,
      y: 100,
      w: 150,
      h: H,
      label: "Limiter",
      sub: "per IP",
      icon: "limiter",
    } as Node,
    lb: {
      x: 105,
      y: 192,
      w: 150,
      h: H,
      label: "Load balancer",
      sub: "least conns",
      icon: "lb",
    } as Node,
    apis: [api(6, 1), api(128, 2), api(250, 3)],
    redis: {
      x: 14,
      y: 400,
      w: 150,
      h: H,
      label: "Redis",
      sub: "cache",
      icon: "cache",
    } as Node,
    pg: {
      x: 196,
      y: 400,
      w: 150,
      h: H,
      label: "Postgres",
      sub: "primary",
      icon: "db",
    } as Node,
    reject: {
      from: [180, 126] as Pt,
      to: [292, 126] as Pt,
      tag: [318, 126] as Pt,
    },
    status: [180, 494] as Pt,
  };
}

const cx = (n: Node) => n.x + n.w / 2;
const cy = (n: Node) => n.y + n.h / 2;

/** Elbow connector between two nodes, leaving `a` and entering `b`. */
function link(a: Node, b: Node, o: Orientation): Pt[] {
  if (o === "wide") {
    const x1 = a.x + a.w;
    const x2 = b.x;
    const mx = (x1 + x2) / 2;
    return cy(a) === cy(b)
      ? [
          [x1, cy(a)],
          [x2, cy(b)],
        ]
      : [
          [x1, cy(a)],
          [mx, cy(a)],
          [mx, cy(b)],
          [x2, cy(b)],
        ];
  }
  const y1 = a.y + a.h;
  const y2 = b.y;
  const my = (y1 + y2) / 2;
  return cx(a) === cx(b)
    ? [
        [cx(a), y1],
        [cx(b), y2],
      ]
    : [
        [cx(a), y1],
        [cx(a), my],
        [cx(b), my],
        [cx(b), y2],
      ];
}

/** A full request route through `nodes`, drawn under the boxes so packets look like they pass through. */
function route(nodes: Node[], o: Orientation): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < nodes.length - 1; i++) pts.push(...link(nodes[i], nodes[i + 1], o));
  return pts;
}

/** Opacity that follows the failure cycle. */
function Cycle({ values, keyTimes }: { values: string; keyTimes: string }) {
  return (
    <animate attributeName="opacity" values={values} keyTimes={keyTimes} dur={`${CYCLE}s`} repeatCount="indefinite" />
  );
}

// Phases of the 12 s loop, as fractions.
const DOWN = { values: "0;0;1;1;0;0", keyTimes: "0;0.4;0.42;0.68;0.7;1" };
const RECOVER = { values: "0;0;1;1;0;0", keyTimes: "0;0.68;0.7;0.84;0.86;1" };
const HEALTHY = { values: "1;1;0;0;1;1", keyTimes: "0;0.4;0.42;0.84;0.86;1" };
const API2_TRAFFIC = {
  values: "1;1;0;0;1;1",
  keyTimes: "0;0.4;0.41;0.85;0.87;1",
};

function Arch({ o }: { o: Orientation }) {
  const L = layout(o);
  const { fans, limiter, lb, apis, redis, pg } = L;
  const stores = [redis, pg];
  const reqRoutes = apis.map((api, i) => route([fans, limiter, lb, api, stores[i % 2]], o));
  const resRoute = (i: number) => [...reqRoutes[i]].reverse() as Pt[];

  return (
    <Diagram
      w={L.W}
      h={L.Ht}
      className="my-0"
      label="Animated architecture: fans send requests through a rate limiter and load balancer to three API servers backed by Redis and Postgres. One server periodically fails and the load balancer routes around it until it recovers."
    >
      {/* Wires */}
      <Wire points={link(fans, limiter, o)} flow />
      <Wire points={link(limiter, lb, o)} flow />
      {apis.map((api) => (
        <Wire key={api.label} points={link(lb, api, o)} />
      ))}
      {apis.flatMap((api) =>
        stores.map((s) => <Wire key={api.label + s.label} points={link(api, s, o)} tone="muted" />),
      )}
      {/* LB -> API 2 turns red while API 2 is down */}
      <g opacity={0}>
        <Cycle {...DOWN} />
        <Wire points={link(lb, apis[1], o)} tone="err" dashed width={1.6} />
      </g>

      {/* Packets travel under the boxes */}
      {[0, 2].map((i) => (
        <g key={i}>
          <Packet points={reqRoutes[i]} dur={3.2} delay={i * 0.55} />
          <Packet points={reqRoutes[i]} dur={3.2} delay={1.6 + i * 0.55} />
          <Packet points={resRoute(i)} dur={3.2} delay={0.9 + i * 0.4} tone="res" />
          <Packet points={resRoute(i)} dur={3.2} delay={2.5 + i * 0.4} tone="res" />
        </g>
      ))}
      <g>
        <Cycle {...API2_TRAFFIC} />
        <Packet points={reqRoutes[1]} dur={3.2} delay={0.3} />
        <Packet points={resRoute(1)} dur={3.2} delay={1.9} tone="res" />
      </g>
      {/* Some traffic is shed with a 429 */}
      <Packet
        points={[...link(fans, limiter, o), L.reject.from, L.reject.to]}
        dur={2.4}
        delay={1.2}
        tone="err"
        r={3.5}
      />

      {/* Boxes */}
      {[fans, limiter, lb, ...apis, redis, pg].map((n) => (
        <Box key={n.label} {...n} sub={n.sub} />
      ))}

      {/* API 2 failure overlay */}
      <g opacity={0}>
        <Cycle {...DOWN} />
        <rect
          x={apis[1].x}
          y={apis[1].y}
          width={apis[1].w}
          height={apis[1].h}
          rx={10}
          fill="var(--err)"
          fillOpacity={0.1}
          stroke="var(--err)"
          strokeWidth={1.6}
        />
        <Tag x={cx(apis[1])} y={apis[1].y - 1} tone="err">
          DOWN
        </Tag>
      </g>
      <g opacity={0}>
        <Cycle {...RECOVER} />
        <rect
          x={apis[1].x}
          y={apis[1].y}
          width={apis[1].w}
          height={apis[1].h}
          rx={10}
          fill="var(--ok)"
          fillOpacity={0.08}
          stroke="var(--ok)"
          strokeWidth={1.6}
        />
        <Tag x={cx(apis[1])} y={apis[1].y - 1} tone="ok">
          BACK
        </Tag>
      </g>

      <Tag x={L.reject.tag[0]} y={L.reject.tag[1]} tone="err">
        429
      </Tag>
      <Tag x={cx(redis)} y={redis.y - 1} tone="res">
        HIT 94%
      </Tag>

      {/* Status line */}
      <g>
        <g opacity={1}>
          <Cycle {...HEALTHY} />
          <Text x={L.status[0]} y={L.status[1]} size={11} mono tone="muted">
            ● all 3 servers healthy · p99 84 ms
          </Text>
        </g>
        <g opacity={0}>
          <Cycle {...DOWN} />
          <Text x={L.status[0]} y={L.status[1]} size={11} mono tone="err">
            api-2 failed health check · traffic rerouted
          </Text>
        </g>
        <g opacity={0}>
          <Cycle {...RECOVER} />
          <Text x={L.status[0]} y={L.status[1]} size={11} mono tone="ok">
            api-2 passed 3 checks · back in rotation
          </Text>
        </g>
      </g>
    </Diagram>
  );
}

export function HeroDiagram() {
  return (
    <MotionGate>
      <div className="hidden sm:block">
        <Arch o="wide" />
      </div>
      <div className="sm:hidden">
        <Arch o="tall" />
      </div>
    </MotionGate>
  );
}
