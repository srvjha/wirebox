"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { Segmented, Slider, Stat, Toggle, VisualFrame, useVisualTracker } from "./distributed-visual-kit";

type Scenario = "ok" | "lost-request" | "lost-reply" | "slow";

const SCEN: Record<Scenario, { label: string; proc: number; dropReq?: boolean; dropRes?: boolean }> = {
  ok: { label: "Works", proc: 250 },
  "lost-request": { label: "Request lost", proc: 250, dropReq: true },
  "lost-reply": { label: "Reply lost", proc: 250, dropRes: true },
  slow: { label: "Slow", proc: 1800 },
};

const NET = 40; // one-way network delay, ms
const RETRY_PROC = 250;
const CX = 66; // client lifeline x
const SX = 236; // server lifeline x
const TOP = 58;
const BOTTOM = 330;

export function NetworkFailureOutcomes() {
  const t = useVisualTracker("network-failure-outcomes");
  const [scenario, setScenario] = useState<Scenario>("lost-reply");
  const [timeout, setTimeoutMs] = useState(1000);
  const [retry, setRetry] = useState(true);
  const [idem, setIdem] = useState(false);

  const s = SCEN[scenario];
  const processed = !s.dropReq;
  const replyAt = 2 * NET + s.proc;
  const replied = processed && !s.dropRes;
  const success = replied && replyAt <= timeout;
  const timedOut = !success;
  const doRetry = timedOut && retry;
  const retryStart = timeout;
  const retryEnd = retryStart + 2 * NET + RETRY_PROC;
  const dedup = doRetry && idem && processed;
  const charges = (processed ? 1 : 0) + (doRetry && !dedup ? 1 : 0);

  const maxT = Math.max(timeout, replied ? replyAt : 0, doRetry ? retryEnd : 0, 600) + 120;
  const y = (ms: number) => TOP + (ms / maxT) * (BOTTOM - TOP);

  const mid = (CX + SX) / 2;
  const seq = `${scenario}-${timeout}-${retry}-${idem}`;
  const step = (i: number) => ({
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { delay: i * 0.35, duration: 0.3 },
  });

  let sees: string;
  if (success) sees = `201 in ${replyAt} ms. All good.`;
  else if (doRetry) sees = `Timed out after ${timeout} ms, retried, got 201 at ${retryEnd} ms.`;
  else sees = `Timed out after ${timeout} ms. No idea what happened.`;

  let truth: string;
  if (!processed) truth = "Payments never saw the first request.";
  else if (s.dropRes) truth = "Payments charged the card. Only the reply was lost.";
  else if (!success) truth = `Payments charged the card, but took ${replyAt} ms. The reply came after booking stopped listening.`;
  else truth = "Payments charged the card and the reply arrived in time.";

  return (
    <VisualFrame
      eyebrow="Try it · what a timeout tells you"
      title="Booking asks payments to charge ₹1,200"
      hint="Pick what the network does, move the timeout, and decide whether booking retries. Compare what booking sees with what really happened."
    >
      <Segmented<Scenario>
        label="What happens on the network"
        size="sm"
        value={scenario}
        onChange={(v) => {
          setScenario(v);
          t();
        }}
        options={(Object.keys(SCEN) as Scenario[]).map((k) => ({ value: k, label: SCEN[k].label }))}
      />
      <div className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-[1fr_auto]">
        <Slider
          label="Booking's timeout"
          value={timeout}
          min={200}
          max={3000}
          step={100}
          onChange={setTimeoutMs}
          onCommit={t}
          format={(v) => `${v} ms`}
        />
        <div className="flex flex-wrap items-center gap-x-4">
          <Toggle
            label="Retry on timeout"
            checked={retry}
            onChange={(v) => {
              setRetry(v);
              t();
            }}
          />
          <Toggle
            label="Idempotency key"
            checked={idem}
            onChange={(v) => {
              setIdem(v);
              t();
            }}
          />
        </div>
      </div>

      <div className="mt-3 rounded-xl border border-line bg-bg">
        <svg viewBox="0 0 360 350" className="mx-auto block h-auto w-full max-w-[460px]" role="img" aria-label={`${sees} ${truth}`}>
          <defs>
            <marker id="nfo-arrow-req" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--req)" />
            </marker>
            <marker id="nfo-arrow-res" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--res)" />
            </marker>
            <marker id="nfo-arrow-muted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
              <path d="M0 0 L10 5 L0 10 z" fill="var(--fg-subtle)" />
            </marker>
          </defs>
          {/* lifelines */}
          {[
            [CX, "Booking"],
            [SX, "Payments"],
          ].map(([x, label]) => (
            <g key={label}>
              <rect x={(x as number) - 46} y={14} width={92} height={28} rx={8} fill="var(--surface-2)" stroke="var(--border-strong)" />
              <text x={x} y={32.5} textAnchor="middle" fontSize={12.5} fontWeight={600} fill="var(--fg)">
                {label}
              </text>
              <line x1={x} x2={x} y1={42} y2={BOTTOM + 8} stroke="var(--border-strong)" strokeDasharray="3 4" />
            </g>
          ))}
          <text x={8} y={y(0) + 4} fontSize={9.5} fill="var(--fg-subtle)" fontFamily="var(--font-geist-mono)">
            0 ms
          </text>

          <g key={seq}>
            {/* original request */}
            <motion.g {...step(0)}>
              {s.dropReq ? (
                <>
                  <line x1={CX} y1={y(0)} x2={mid} y2={y(NET / 2)} stroke="var(--req)" strokeWidth={1.6} />
                  <Cross x={mid} y={y(NET / 2)} />
                  <text x={mid} y={y(NET / 2) - 10} textAnchor="middle" fontSize={11.5} fill="var(--err)">
                    dropped
                  </text>
                </>
              ) : (
                <line x1={CX} y1={y(0)} x2={SX} y2={y(NET)} stroke="var(--req)" strokeWidth={1.6} markerEnd="url(#nfo-arrow-req)" />
              )}
              <text x={CX + 8} y={y(0) - 6} fontSize={11.5} fill="var(--req)" fontFamily="var(--font-geist-mono)">
                charge{idem ? " key=k1" : ""}
              </text>
            </motion.g>

            {/* processing */}
            {processed && (
              <motion.g {...step(1)}>
                <rect x={SX - 5} y={y(NET)} width={10} height={Math.max(3, y(NET + s.proc) - y(NET))} rx={3} fill="var(--accent)" />
                <text x={SX + 10} y={(y(NET) + y(NET + s.proc)) / 2 + 4} fontSize={11.5} fill="var(--fg)">
                  charged ₹1,200
                </text>
              </motion.g>
            )}

            {/* reply */}
            {processed && (
              <motion.g {...step(2)}>
                {s.dropRes ? (
                  <>
                    <line x1={SX} y1={y(NET + s.proc)} x2={mid} y2={y(NET * 1.5 + s.proc)} stroke="var(--res)" strokeWidth={1.6} />
                    <Cross x={mid} y={y(NET * 1.5 + s.proc)} />
                    <text x={mid} y={y(NET * 1.5 + s.proc) + 18} textAnchor="middle" fontSize={11.5} fill="var(--err)">
                      reply dropped
                    </text>
                  </>
                ) : (
                  <>
                    <line
                      x1={SX}
                      y1={y(NET + s.proc)}
                      x2={CX}
                      y2={y(replyAt)}
                      stroke={success ? "var(--res)" : "var(--fg-subtle)"}
                      strokeDasharray={success ? undefined : "4 3"}
                      strokeWidth={1.6}
                      markerEnd={success ? "url(#nfo-arrow-res)" : "url(#nfo-arrow-muted)"}
                    />
                    <text x={CX + 8} y={y(replyAt) + 14} fontSize={11.5} fill={success ? "var(--res)" : "var(--fg-subtle)"}>
                      {success ? `201 at ${replyAt} ms` : "201, too late: ignored"}
                    </text>
                  </>
                )}
              </motion.g>
            )}

            {/* timeout */}
            {timedOut && (
              <motion.g {...step(3)}>
                <line x1={CX - 52} x2={CX + 30} y1={y(timeout)} y2={y(timeout)} stroke="var(--warn)" strokeWidth={1.4} strokeDasharray="4 3" />
                <circle cx={CX} cy={y(timeout)} r={4} fill="var(--warn)" />
                <text x={8} y={y(timeout) - 5} fontSize={10} fill="var(--warn)" fontFamily="var(--font-geist-mono)">
                  timeout {timeout}
                </text>
              </motion.g>
            )}

            {/* retry */}
            {doRetry && (
              <motion.g {...step(4)}>
                <line
                  x1={CX}
                  y1={y(retryStart)}
                  x2={SX}
                  y2={y(retryStart + NET)}
                  stroke="var(--req)"
                  strokeWidth={1.6}
                  markerEnd="url(#nfo-arrow-req)"
                />
                <text x={CX + 8} y={y(retryStart) + 16} fontSize={11.5} fill="var(--req)" fontFamily="var(--font-geist-mono)">
                  retry{idem ? " key=k1" : ""}
                </text>
                <rect
                  x={SX - 5}
                  y={y(retryStart + NET)}
                  width={10}
                  height={Math.max(3, y(retryStart + NET + RETRY_PROC) - y(retryStart + NET))}
                  rx={3}
                  fill={dedup ? "var(--info)" : processed ? "var(--err)" : "var(--accent)"}
                />
                <text
                  x={SX + 10}
                  y={y(retryStart + NET + RETRY_PROC / 2) + 4}
                  fontSize={11.5}
                  fill={dedup ? "var(--info)" : processed ? "var(--err)" : "var(--fg)"}
                >
                  {dedup ? "seen k1: same result" : processed ? "charged again!" : "charged ₹1,200"}
                </text>
                <line
                  x1={SX}
                  y1={y(retryStart + NET + RETRY_PROC)}
                  x2={CX}
                  y2={y(retryEnd)}
                  stroke="var(--res)"
                  strokeWidth={1.6}
                  markerEnd="url(#nfo-arrow-res)"
                />
              </motion.g>
            )}
          </g>
        </svg>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <p className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">What booking sees</p>
          <p className="mt-1 text-[13.5px] leading-snug text-fg">{sees}</p>
        </div>
        <div className="rounded-xl border border-line bg-surface-2 px-3 py-2.5">
          <p className="font-mono text-[10.5px] tracking-wider text-subtle uppercase">What really happened</p>
          <p className="mt-1 text-[13.5px] leading-snug text-fg">{truth}</p>
        </div>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Stat
          label="Times charged"
          value={charges}
          tone={charges === 1 ? "ok" : "err"}
          sub={charges === 0 ? "fan has no ticket" : charges === 1 ? "correct" : "fan paid twice"}
        />
        <Stat
          label="Fan gets a ticket?"
          value={success || doRetry ? "Yes" : "Unknown"}
          tone={success || doRetry ? "ok" : "warn"}
          sub={success || doRetry ? "booking got a 201" : "booking must decide what to tell her"}
        />
      </div>
      <p className={cn("mt-2 text-[12.5px] leading-relaxed text-subtle")}>
        One-way network delay is {NET} ms. A healthy charge takes 250 ms; a slow one 1,800 ms.
      </p>
    </VisualFrame>
  );
}

function Cross({ x, y }: { x: number; y: number }) {
  return (
    <g stroke="var(--err)" strokeWidth={2} strokeLinecap="round">
      <line x1={x - 6} y1={y - 6} x2={x + 6} y2={y + 6} />
      <line x1={x - 6} y1={y + 6} x2={x + 6} y2={y - 6} />
    </g>
  );
}
