import type { ReactNode } from "react";
import { Eye, Hammer, SlidersHorizontal, Zap } from "lucide-react";
import { Box, Packet, Tag, Text } from "@/components/diagram/kit";
import { MotionGate } from "./motion-gate";

function Mini({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg
      viewBox="0 0 240 132"
      className="block h-auto w-full"
      role="img"
      aria-label={label}
      fontFamily="var(--font-geist-sans)"
    >
      {children}
    </svg>
  );
}

function SeeIt() {
  const go: [number, number][] = [
    [74, 52],
    [166, 52],
  ];
  const back: [number, number][] = [
    [166, 80],
    [74, 80],
  ];
  return (
    <Mini label="A request travelling from a phone to a server and the response coming back">
      <path d="M74 52H166M166 80H74" stroke="var(--border-strong)" strokeDasharray="3 4" fill="none" />
      <Packet points={go} dur={1.8} />
      <Packet points={go} dur={1.8} delay={0.9} />
      <Packet points={back} dur={1.8} delay={0.45} tone="res" />
      <Packet points={back} dur={1.8} delay={1.35} tone="res" />
      <Box x={8} y={40} w={66} h={52} label="App" icon="phone" />
      <Box x={166} y={40} w={66} h={52} label="API" icon="server" />
      <Text x={120} y={40} size={10} mono tone="req">
        GET /events
      </Text>
      <Text x={120} y={102} size={10} mono tone="res">
        200 · 38 ms
      </Text>
    </Mini>
  );
}

function TryIt() {
  const dur = "6s";
  return (
    <Mini label="A TTL slider moving, and the cache hit rate bar rising and falling with it">
      <Text x={14} y={26} size={10.5} mono anchor="start" tone="muted">
        CACHE TTL
      </Text>
      <rect x={14} y={36} width={212} height={4} rx={2} fill="var(--surface-3)" />
      <rect x={14} y={36} width={60} height={4} rx={2} fill="var(--accent)">
        <animate
          attributeName="width"
          values="30;170;170;30;30"
          keyTimes="0;0.35;0.55;0.9;1"
          dur={dur}
          repeatCount="indefinite"
        />
      </rect>
      <circle cx={74} cy={38} r={7} fill="var(--surface)" stroke="var(--accent)" strokeWidth={2}>
        <animate
          attributeName="cx"
          values="44;184;184;44;44"
          keyTimes="0;0.35;0.55;0.9;1"
          dur={dur}
          repeatCount="indefinite"
        />
      </circle>
      <Text x={14} y={74} size={10.5} mono anchor="start" tone="muted">
        HIT RATE
      </Text>
      <rect x={14} y={84} width={212} height={18} rx={5} fill="var(--surface-2)" stroke="var(--border)" />
      <rect x={14} y={84} width={100} height={18} rx={5} fill="var(--res)" fillOpacity={0.75}>
        <animate
          attributeName="width"
          values="70;196;196;70;70"
          keyTimes="0;0.4;0.55;0.95;1"
          dur={dur}
          repeatCount="indefinite"
        />
      </rect>
      <Text x={226} y={122} size={10} mono anchor="end" tone="muted">
        one knob, instant feedback
      </Text>
    </Mini>
  );
}

function BuildIt() {
  return (
    <Mini label="Components being placed on a canvas and wired together">
      <rect x={0} y={0} width={240} height={132} rx={10} fill="url(#hiw-dots)" />
      <defs>
        <pattern id="hiw-dots" width={12} height={12} patternUnits="userSpaceOnUse">
          <circle cx={1} cy={1} r={0.8} fill="var(--border-strong)" />
        </pattern>
      </defs>
      <path
        d="M86 40H120V92H150"
        fill="none"
        stroke="var(--accent)"
        strokeWidth={1.4}
        strokeDasharray="120"
        strokeDashoffset="120"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="120;0;0;120"
          keyTimes="0;0.4;0.85;1"
          dur="5s"
          repeatCount="indefinite"
        />
      </path>
      <Box x={10} y={16} w={76} h={48} label="LB" icon="lb" />
      <Box x={150} y={68} w={80} h={48} label="API" icon="server" tone="accent" />
      <g>
        <animateTransform
          attributeName="transform"
          type="translate"
          values="0 -6;0 0;0 0;0 -6"
          keyTimes="0;0.3;0.85;1"
          dur="5s"
          repeatCount="indefinite"
        />
        <Box x={10} y={76} w={76} h={44} label="Redis" icon="cache" dashed />
      </g>
      <Tag x={190} y={22} tone="ok">
        STEP 3 ✓
      </Tag>
    </Mini>
  );
}

function BreakIt() {
  // p99 latency line that blows through the SLO when traffic spikes.
  const pts = "8,96 32,94 56,95 80,90 104,92 124,70 140,30 156,24 172,40 190,88 214,92 232,90";
  return (
    <Mini label="A latency chart spiking past the target during a load test">
      <line x1={8} x2={232} y1={60} y2={60} stroke="var(--err)" strokeDasharray="4 4" strokeOpacity={0.7} />
      <Text x={232} y={54} size={9.5} mono anchor="end" tone="err">
        SLO 200 ms
      </Text>
      <polyline
        points={pts}
        fill="none"
        stroke="var(--warn)"
        strokeWidth={2}
        strokeLinejoin="round"
        strokeDasharray="320"
        strokeDashoffset="320"
      >
        <animate
          attributeName="stroke-dashoffset"
          values="320;0;0"
          keyTimes="0;0.6;1"
          dur="4.5s"
          repeatCount="indefinite"
        />
      </polyline>
      <line x1={8} x2={232} y1={112} y2={112} stroke="var(--border-strong)" />
      <Text x={8} y={126} size={9.5} mono anchor="start" tone="muted">
        1k rps
      </Text>
      <Text x={232} y={126} size={9.5} mono anchor="end" tone="muted">
        50k rps
      </Text>
      <Tag x={148} y={12} tone="err">
        p99 1.4 s
      </Tag>
    </Mini>
  );
}

const steps = [
  {
    icon: Eye,
    verb: "See it",
    title: "Watch the system move",
    body: "Every idea starts as a living diagram. Requests travel, caches hit and miss, servers fall over. You see the mechanism before you read the definition.",
    art: <SeeIt />,
  },
  {
    icon: SlidersHorizontal,
    verb: "Try it",
    title: "Turn one knob",
    body: "Change a TTL, a replica count or a rate limit and watch the numbers react. One variable at a time, so the cause and the effect are obvious.",
    art: <TryIt />,
  },
  {
    icon: Hammer,
    verb: "Build it",
    title: "Design a real product",
    body: "Labs hand you a product brief. You write the API, model the data and wire the architecture yourself, one checked step at a time.",
    art: <BuildIt />,
  },
  {
    icon: Zap,
    verb: "Break it",
    title: "Load test it until it cracks",
    body: "Throw 50,000 requests a second at your design, kill a database, replay an incident. Then read why it failed and fix it.",
    art: <BreakIt />,
  },
];

export function HowItWorks() {
  return (
    <MotionGate className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" freezeAt={2.2}>
      {steps.map((s, i) => (
        <article key={s.verb} className="flex flex-col rounded-2xl border border-line bg-surface p-4">
          <div className="overflow-hidden rounded-xl border border-line bg-sunken p-2">{s.art}</div>
          <div className="mt-4 flex items-center gap-2">
            <span className="font-mono text-[11px] text-subtle">0{i + 1}</span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft px-2 py-0.5 font-mono text-[10.5px] tracking-wide text-accent uppercase">
              <s.icon className="size-3" aria-hidden /> {s.verb}
            </span>
          </div>
          <h3 className="mt-3 text-[15.5px] font-semibold tracking-tight text-fg">{s.title}</h3>
          <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{s.body}</p>
        </article>
      ))}
    </MotionGate>
  );
}
