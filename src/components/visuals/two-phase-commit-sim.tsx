"use client";

import { useEffect, useReducer } from "react";
import { Power, RotateCcw, Skull, StepForward } from "lucide-react";
import { Box, Tag, Text, Wire, type Tone } from "@/components/diagram/kit";
import { cn } from "@/lib/utils";
import { Stat, VisualButton, VisualCanvas, VisualShell, useVisualTracker } from "./visual-shell";

type PState = "idle" | "prepared" | "voted-no" | "committed" | "aborted";
type Decision = "COMMIT" | "ABORT" | null;

const PARTS = [
  { id: "payments", name: "Payments", holds: "₹1,800 hold" },
  { id: "seats", name: "Seats", holds: "lock on A12" },
  { id: "tickets", name: "Tickets", holds: "ticket no. reserved" },
] as const;

type State = {
  /** 0 idle, 1 prepare sent, 2 votes in, 3 decision logged, 4 decision sent, 5 done */
  phase: number;
  votes: boolean[];
  parts: PState[];
  decision: Decision;
  crashed: boolean;
  stuck: number;
  blocked: number;
  log: string[];
};

const initial = (votes: boolean[] = [true, true, true]): State => ({
  phase: 0,
  votes,
  parts: ["idle", "idle", "idle"],
  decision: null,
  crashed: false,
  stuck: 0,
  blocked: 0,
  log: ["Fan taps “Pay ₹1,800”. Booking starts a distributed transaction across three databases."],
});

type Action = { type: "next" } | { type: "crash" } | { type: "restart" } | { type: "tick" } | { type: "vote"; i: number } | { type: "reset" };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "reset":
      return initial(s.votes);
    case "vote": {
      if (s.phase >= 2) return s;
      const votes = s.votes.map((v, i) => (i === a.i ? !v : v));
      return { ...s, votes };
    }
    case "tick": {
      if (!s.crashed) return s;
      const holding = s.parts.filter((p) => p === "prepared").length;
      return { ...s, stuck: s.stuck + 1, blocked: s.blocked + (holding ? 3 : 0) };
    }
    case "crash":
      if (s.crashed || s.phase === 0 || s.phase >= 5) return s;
      return {
        ...s,
        crashed: true,
        log: [
          ...s.log,
          s.phase >= 3
            ? `Coordinator crashed after logging ${s.decision}, before everyone heard it.`
            : "Coordinator crashed before deciding. Participants that voted YES must wait: they promised to commit if told to, so they can't abort on their own.",
        ],
      };
    case "restart": {
      if (!s.crashed) return s;
      if (s.phase >= 3) {
        return { ...s, crashed: false, phase: 3, log: [...s.log, `Coordinator restarted and read its log: ${s.decision}. It resends the decision.`] };
      }
      return {
        ...s,
        crashed: false,
        phase: 3,
        decision: "ABORT",
        log: [...s.log, "Coordinator restarted. No decision in its log, so it logs ABORT (“presumed abort”) and tells everyone."],
      };
    }
    case "next": {
      if (s.crashed || s.phase >= 5) return s;
      switch (s.phase) {
        case 0:
          return { ...s, phase: 1, log: [...s.log, "Phase 1: coordinator sends PREPARE to all three participants."] };
        case 1: {
          const parts = s.votes.map((v) => (v ? "prepared" : "voted-no")) as PState[];
          const no = PARTS.filter((_, i) => !s.votes[i]).map((p) => p.name);
          return {
            ...s,
            phase: 2,
            parts,
            log: [
              ...s.log,
              no.length
                ? `${no.join(" and ")} voted NO and rolled back. The others wrote a prepare record, kept their locks and voted YES.`
                : "Every participant wrote a prepare record to disk, kept its locks, and voted YES.",
            ],
          };
        }
        case 2: {
          const decision: Decision = s.votes.every(Boolean) ? "COMMIT" : "ABORT";
          return {
            ...s,
            phase: 3,
            decision,
            log: [...s.log, `Coordinator writes ${decision} to its own log. This write is the moment the transaction is decided.`],
          };
        }
        case 3:
          return { ...s, phase: 4, log: [...s.log, `Phase 2: coordinator sends ${s.decision} to every participant.`] };
        case 4: {
          const parts = s.parts.map((p) => (p === "voted-no" ? "aborted" : s.decision === "COMMIT" ? "committed" : "aborted")) as PState[];
          return {
            ...s,
            phase: 5,
            parts,
            log: [
              ...s.log,
              s.decision === "COMMIT"
                ? "Participants commit, release their locks and ACK. The fan has a ticket."
                : "Participants roll back, release their locks and ACK. The fan's card is not charged.",
            ],
          };
        }
      }
      return s;
    }
  }
}

const STATE_LABEL: Record<PState, { sub: string; tone: Tone }> = {
  idle: { sub: "working", tone: "default" },
  prepared: { sub: "prepared, locked", tone: "info" },
  "voted-no": { sub: "voted NO", tone: "err" },
  committed: { sub: "committed", tone: "ok" },
  aborted: { sub: "rolled back", tone: "muted" },
};

const PX = [30, 245, 460];

export function TwoPhaseCommitSim() {
  const t = useVisualTracker("two-phase-commit");
  const [s, dispatch] = useReducer(reducer, undefined, () => initial());

  useEffect(() => {
    if (!s.crashed) return;
    const id = setInterval(() => dispatch({ type: "tick" }), 1000);
    return () => clearInterval(id);
  }, [s.crashed]);

  const inDoubt = s.crashed && s.parts.some((p) => p === "prepared");

  function message(i: number): { label: string; tone: Tone; up: boolean } | null {
    if (s.phase === 1) return { label: "PREPARE", tone: "req", up: false };
    if (s.phase === 2) return s.votes[i] ? { label: "YES", tone: "res", up: true } : { label: "NO", tone: "err", up: true };
    if (s.phase === 4) return { label: s.decision ?? "", tone: s.decision === "COMMIT" ? "ok" : "err", up: false };
    if (s.phase === 5) return { label: "ACK", tone: "res", up: true };
    return null;
  }

  return (
    <VisualShell
      title="Two-phase commit, one step at a time"
      hint="Step through a booking that spans three databases. Then reset and crash the coordinator after the votes, before it decides."
    >
      <VisualCanvas w={640} h={300} label="Coordinator and three participants">
        <Box
          x={225}
          y={14}
          w={190}
          h={58}
          label={s.crashed ? "Coordinator ✕" : "Coordinator"}
          sub={s.decision ? `log: ${s.decision}` : "log: (no decision)"}
          icon="service"
          tone={s.crashed ? "err" : "accent"}
          dashed={s.crashed}
        />
        {PARTS.map((p, i) => {
          const st = s.parts[i];
          const doubt = s.crashed && st === "prepared";
          const m = message(i);
          const cx = PX[i] + 75;
          const pts: [number, number][] = [
            [320, 74],
            [cx, 208],
          ];
          return (
            <g key={p.id}>
              <Wire points={m?.up ? [pts[1], pts[0]] : pts} tone={m ? m.tone : "muted"} arrow={!!m} dashed={!m} />
              {m && !s.crashed && <Tag x={(320 + cx) / 2} y={141} tone={m.tone}>{m.label}</Tag>}
              <Box
                x={PX[i]}
                y={210}
                w={150}
                h={58}
                label={p.name}
                sub={doubt ? "IN DOUBT, locked" : STATE_LABEL[st].sub}
                icon="db"
                tone={doubt ? "warn" : STATE_LABEL[st].tone}
              />
              {(st === "prepared" || doubt) && (
                <Text x={cx} y={290} size={10.5} mono tone={doubt ? "warn" : "info"}>
                  holds {p.holds}
                </Text>
              )}
            </g>
          );
        })}
      </VisualCanvas>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <VisualButton
          tone="accent"
          onClick={() => {
            t("next", s.phase + 1);
            dispatch({ type: "next" });
          }}
          disabled={s.crashed || s.phase >= 5}
        >
          <StepForward className="size-3.5" /> Next step
        </VisualButton>
        <VisualButton
          tone="err"
          onClick={() => {
            t("crash", s.phase);
            dispatch({ type: "crash" });
          }}
          disabled={s.crashed || s.phase === 0 || s.phase >= 5}
        >
          <Skull className="size-3.5" /> Crash coordinator
        </VisualButton>
        <VisualButton
          tone="ok"
          onClick={() => {
            t("restart", s.stuck);
            dispatch({ type: "restart" });
          }}
          disabled={!s.crashed}
        >
          <Power className="size-3.5" /> Restart it
        </VisualButton>
        <VisualButton
          onClick={() => {
            t("reset", true);
            dispatch({ type: "reset" });
          }}
          title="Reset"
          className="ml-auto"
        >
          <RotateCcw className="size-3.5" />
          <span className="sr-only">Reset</span>
        </VisualButton>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">Votes</span>
        {PARTS.map((p, i) => (
          <button
            key={p.id}
            type="button"
            disabled={s.phase >= 2}
            aria-pressed={!s.votes[i]}
            onClick={() => {
              t(`vote-${p.id}`, !s.votes[i]);
              dispatch({ type: "vote", i });
            }}
            className={cn(
              "rounded-lg border px-2.5 py-1 font-mono text-[11.5px] outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50",
              s.votes[i] ? "border-res/40 bg-res/10 text-res" : "border-err/40 bg-err/10 text-err",
            )}
          >
            {p.name}: {s.votes[i] ? "YES" : "NO"}
          </button>
        ))}
      </div>

      <div className="mt-3 max-h-40 space-y-1 overflow-y-auto rounded-xl border border-line bg-bg px-3 py-2" aria-live="polite">
        {s.log.map((l, i) => (
          <p key={i} className={cn("text-[12.5px] leading-relaxed", i === s.log.length - 1 ? "text-fg" : "text-subtle")}>
            <span className="mr-2 font-mono text-[10.5px] text-subtle">{String(i).padStart(2, "0")}</span>
            {l}
          </p>
        ))}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label="Phase" value={["idle", "prepare", "votes", "decided", "sending", "done"][s.phase]} />
        <Stat label="Locks held for" value={inDoubt ? `${s.stuck}s` : "–"} tone={inDoubt ? "warn" : undefined} />
        <Stat label="Bookings blocked" value={s.blocked} tone={s.blocked ? "err" : undefined} />
      </div>
    </VisualShell>
  );
}
