import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * SVG diagram kit. Everything is drawn in a fixed viewBox and scales to the
 * container, so the same diagram works on a phone and a wide screen. Packets
 * use <animateMotion>, so diagrams animate with zero JavaScript and render on
 * the server.
 */

export type Tone = "default" | "accent" | "req" | "res" | "ok" | "warn" | "err" | "info" | "muted";

export const toneColor: Record<Tone, string> = {
  default: "var(--fg-muted)",
  accent: "var(--accent)",
  req: "var(--req)",
  res: "var(--res)",
  ok: "var(--ok)",
  warn: "var(--warn)",
  err: "var(--err)",
  info: "var(--info)",
  muted: "var(--fg-subtle)",
};

export type IconKind =
  | "client"
  | "phone"
  | "server"
  | "db"
  | "cache"
  | "lb"
  | "queue"
  | "worker"
  | "cdn"
  | "storage"
  | "limiter"
  | "dns"
  | "user"
  | "service"
  | "stream";

export function Diagram({
  w,
  h,
  caption,
  className,
  children,
  label,
}: {
  w: number;
  h: number;
  caption?: ReactNode;
  className?: string;
  label?: string;
  children: ReactNode;
}) {
  return (
    <figure className={cn("not-prose my-8", className)}>
      <div className="bg-dots overflow-hidden rounded-2xl border border-line bg-surface p-3 sm:p-5">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          className="block h-auto w-full overflow-visible"
          role="img"
          aria-label={label ?? (typeof caption === "string" ? caption : "Diagram")}
          fontFamily="var(--font-geist-sans)"
        >
          <defs>
            {(["default", "req", "res", "err", "accent", "muted", "info", "ok", "warn"] as Tone[]).map((t) => (
              <marker
                key={t}
                id={`arrow-${t}`}
                viewBox="0 0 10 10"
                refX="8.5"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0 0 L10 5 L0 10 z" fill={toneColor[t]} />
              </marker>
            ))}
          </defs>
          {children}
        </svg>
      </div>
      {caption && <figcaption className="mt-3 text-center text-[13.5px] text-subtle">{caption}</figcaption>}
    </figure>
  );
}

function Glyph({ kind, x, y, size = 18, color }: { kind: IconKind; x: number; y: number; size?: number; color: string }) {
  const s = size / 20;
  const common = { fill: "none", stroke: color, strokeWidth: 1.5 / s, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <g transform={`translate(${x - size / 2} ${y - size / 2}) scale(${s})`}>
      {kind === "client" && (
        <g {...common}>
          <rect x="2" y="3.5" width="16" height="10.5" rx="1.5" />
          <path d="M7 17.5h6M10 14v3.5" />
        </g>
      )}
      {kind === "phone" && (
        <g {...common}>
          <rect x="5.5" y="2" width="9" height="16" rx="2" />
          <path d="M9 15.5h2" />
        </g>
      )}
      {kind === "user" && (
        <g {...common}>
          <circle cx="10" cy="7" r="3.5" />
          <path d="M3.5 18a6.5 6.5 0 0 1 13 0" />
        </g>
      )}
      {(kind === "server" || kind === "service") && (
        <g {...common}>
          <rect x="3" y="3" width="14" height="6" rx="1.5" />
          <rect x="3" y="11" width="14" height="6" rx="1.5" />
          <path d="M6 6h.01M6 14h.01" strokeWidth={2.5 / s} />
        </g>
      )}
      {kind === "worker" && (
        <g {...common}>
          <circle cx="10" cy="10" r="3" />
          <path d="M10 2.5v2.5M10 15v2.5M2.5 10H5M15 10h2.5M4.7 4.7l1.8 1.8M13.5 13.5l1.8 1.8M4.7 15.3l1.8-1.8M13.5 6.5l1.8-1.8" />
        </g>
      )}
      {kind === "db" && (
        <g {...common}>
          <ellipse cx="10" cy="5" rx="6.5" ry="2.5" />
          <path d="M3.5 5v10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5V5M3.5 10c0 1.4 2.9 2.5 6.5 2.5s6.5-1.1 6.5-2.5" />
        </g>
      )}
      {kind === "cache" && (
        <g {...common}>
          <path d="M11 2 4.5 11H10l-1 7 6.5-9H10l1-7z" />
        </g>
      )}
      {kind === "lb" && (
        <g {...common}>
          <circle cx="10" cy="4.5" r="2" />
          <path d="M10 6.5v3M4 15.5V12.5h12v3M10 9.5v6" />
          <circle cx="4" cy="16.5" r="1.3" />
          <circle cx="10" cy="16.5" r="1.3" />
          <circle cx="16" cy="16.5" r="1.3" />
        </g>
      )}
      {kind === "queue" && (
        <g {...common}>
          <rect x="2" y="6" width="16" height="8" rx="1.5" />
          <path d="M6.5 6v8M10 6v8M13.5 6v8" />
        </g>
      )}
      {kind === "stream" && (
        <g {...common}>
          <path d="M2 6h12M2 10h16M2 14h10" />
          <path d="M15 4l3 2-3 2" />
        </g>
      )}
      {kind === "cdn" && (
        <g {...common}>
          <circle cx="10" cy="10" r="7" />
          <path d="M3 10h14M10 3c2 2 3 4.5 3 7s-1 5-3 7c-2-2-3-4.5-3-7s1-5 3-7z" />
        </g>
      )}
      {kind === "storage" && (
        <g {...common}>
          <path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5z" />
          <path d="M3 6.5 10 10l7-3.5M10 10v7" />
        </g>
      )}
      {kind === "limiter" && (
        <g {...common}>
          <path d="M3.5 14a6.5 6.5 0 1 1 13 0" />
          <path d="M10 14l3.5-4" />
          <path d="M3 17h14" />
        </g>
      )}
      {kind === "dns" && (
        <g {...common}>
          <path d="M3 5h14M3 10h14M3 15h14" />
          <circle cx="6" cy="5" r=".6" />
          <circle cx="6" cy="10" r=".6" />
          <circle cx="6" cy="15" r=".6" />
        </g>
      )}
    </g>
  );
}

/** A labelled component box. (x, y) is the top-left corner. */
export function Box({
  x,
  y,
  w = 128,
  h = 52,
  label,
  sub,
  icon,
  tone = "default",
  dashed,
  dim,
}: {
  x: number;
  y: number;
  w?: number;
  h?: number;
  label: string;
  sub?: string;
  icon?: IconKind;
  tone?: Tone;
  dashed?: boolean;
  dim?: boolean;
}) {
  const color = toneColor[tone];
  const hasIcon = !!icon;
  const textX = hasIcon ? x + 36 : x + w / 2;
  const anchor = hasIcon ? "start" : "middle";
  return (
    <g opacity={dim ? 0.35 : 1}>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        rx={10}
        fill="var(--surface-2)"
        stroke={tone === "default" ? "var(--border-strong)" : color}
        strokeWidth={tone === "default" ? 1 : 1.4}
        strokeDasharray={dashed ? "5 4" : undefined}
      />
      {icon && <Glyph kind={icon} x={x + 19} y={y + h / 2} color={tone === "default" ? "var(--fg)" : color} />}
      <text
        x={textX}
        y={sub ? y + h / 2 - 3 : y + h / 2 + 4.5}
        textAnchor={anchor}
        fontSize={13}
        fontWeight={600}
        fill="var(--fg)"
      >
        {label}
      </text>
      {sub && (
        <text
          x={textX}
          y={y + h / 2 + 12}
          textAnchor={anchor}
          fontSize={10.5}
          fill="var(--fg-subtle)"
          fontFamily="var(--font-geist-mono)"
        >
          {sub}
        </text>
      )}
    </g>
  );
}

export type Pt = [number, number];

export function pathOf(points: Pt[]) {
  return points.map(([x, y], i) => `${i ? "L" : "M"}${x} ${y}`).join(" ");
}

/** A connection. Pass `points` for straight segments or `d` for a custom path. */
export function Wire({
  points,
  d,
  tone = "default",
  arrow = true,
  flow,
  dashed,
  label,
  labelAt,
  width = 1.4,
}: {
  points?: Pt[];
  d?: string;
  tone?: Tone;
  arrow?: boolean;
  flow?: boolean;
  dashed?: boolean;
  label?: string;
  labelAt?: Pt;
  width?: number;
}) {
  const path = d ?? pathOf(points ?? []);
  const color = tone === "default" ? "var(--border-strong)" : toneColor[tone];
  const mid = labelAt ?? (points && points.length >= 2 ? midpoint(points) : undefined);
  return (
    <g>
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={width}
        strokeDasharray={dashed ? "4 4" : undefined}
        className={flow ? "wire-flow" : undefined}
        markerEnd={arrow ? `url(#arrow-${tone})` : undefined}
      />
      {label && mid && (
        <g>
          <rect
            x={mid[0] - label.length * 3.3 - 6}
            y={mid[1] - 10}
            width={label.length * 6.6 + 12}
            height={18}
            rx={5}
            fill="var(--surface)"
            stroke="var(--border)"
          />
          <text x={mid[0]} y={mid[1] + 3.5} textAnchor="middle" fontSize={10.5} fill="var(--fg-muted)" fontFamily="var(--font-geist-mono)">
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

function midpoint(points: Pt[]): Pt {
  const [a, b] = [points[Math.floor((points.length - 1) / 2)], points[Math.floor((points.length - 1) / 2) + 1]];
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/** A dot travelling along a path forever. */
export function Packet({
  points,
  d,
  dur = 2,
  delay = 0,
  tone = "req",
  r = 4,
}: {
  points?: Pt[];
  d?: string;
  dur?: number;
  delay?: number;
  tone?: Tone;
  r?: number;
}) {
  const path = d ?? pathOf(points ?? []);
  return (
    <circle r={r} fill={toneColor[tone]} opacity={0}>
      <animateMotion dur={`${dur}s`} begin={`${delay}s`} repeatCount="indefinite" path={path} />
      <animate
        attributeName="opacity"
        values="0;1;1;0"
        keyTimes="0;0.08;0.9;1"
        dur={`${dur}s`}
        begin={`${delay}s`}
        repeatCount="indefinite"
      />
    </circle>
  );
}

export function Text({
  x,
  y,
  children,
  size = 12,
  anchor = "middle",
  tone = "default",
  mono,
  weight,
}: {
  x: number;
  y: number;
  children: ReactNode;
  size?: number;
  anchor?: "start" | "middle" | "end";
  tone?: Tone;
  mono?: boolean;
  weight?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      fontSize={size}
      textAnchor={anchor}
      fill={tone === "default" ? "var(--fg-muted)" : toneColor[tone]}
      fontFamily={mono ? "var(--font-geist-mono)" : undefined}
      fontWeight={weight}
    >
      {children}
    </text>
  );
}

/** A dashed boundary around a group of boxes (a region, a service, a machine). */
export function Group({
  x,
  y,
  w,
  h,
  label,
  tone = "muted",
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label?: string;
  tone?: Tone;
}) {
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={14} fill="none" stroke={toneColor[tone]} strokeDasharray="5 5" />
      {label && (
        <text x={x + 12} y={y - 7} fontSize={10.5} fill={toneColor[tone]} fontFamily="var(--font-geist-mono)" letterSpacing={0.6}>
          {label.toUpperCase()}
        </text>
      )}
    </g>
  );
}

/** A small pill tag, e.g. "HIT", "429", "v2". */
export function Tag({ x, y, children, tone = "accent" }: { x: number; y: number; children: string; tone?: Tone }) {
  const w = children.length * 6.4 + 12;
  return (
    <g>
      <rect x={x - w / 2} y={y - 9} width={w} height={18} rx={9} fill="var(--surface)" stroke={toneColor[tone]} />
      <text x={x} y={y + 3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill={toneColor[tone]} fontFamily="var(--font-geist-mono)">
        {children}
      </text>
    </g>
  );
}
