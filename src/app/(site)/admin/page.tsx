import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ExternalLink } from "lucide-react";
import { getLesson } from "@/content/course";
import { getDrillMeta } from "@/content/drills/catalog";
import { getServerSession, isAdmin } from "@/lib/session";
import { formatNumber } from "@/lib/utils";
import { getAdminStats, type AdminStats } from "./queries";
import { SignupChart } from "./signup-chart";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

const providerLabel: Record<string, string> = { credential: "Email & password", google: "Google", github: "GitHub" };

function pct(a: number, b: number) {
  return b ? `${Math.round((a / b) * 100)}%` : "–";
}

function Card({ title, children, className }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-surface p-5 ${className ?? ""}`}>
      <h2 className="mb-4 text-[13px] text-subtle">{title}</h2>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface p-4">
      <p className="text-[12.5px] text-muted">{label}</p>
      <p className="mt-1 text-[28px] font-semibold tracking-tight text-fg tabular-nums">
        {typeof value === "number" ? formatNumber(value) : value}
      </p>
      {sub && <p className="font-mono text-[11px] text-subtle">{sub}</p>}
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-subtle">{children}</p>;
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[22rem] text-[13px]">
        <thead>
          <tr className="text-left text-subtle">
            {head.map((h, i) => (
              <th key={h} className={`px-1 pb-2 font-normal ${i ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j} className={`px-1 py-2 ${j ? "text-right font-mono text-muted tabular-nums" : "text-fg"}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Dashboard({ s }: { s: AdminStats }) {
  const totalProviderUsers = s.providers.reduce((n, p) => n + p.users, 0);
  const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_UI_HOST;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total users" value={s.users.total} sub={`+ ${s.users.guests} guest sessions`} />
        <Kpi label="New, last 24h" value={s.users.d1} sub={`${s.users.d7} in 7d · ${s.users.d30} in 30d`} />
        <Kpi label="Active learners, 7d" value={s.activeLearners7d} sub="lesson, drill or load test" />
        <Kpi label="AI postmortems" value={s.postmortems.n} sub={`${s.postmortems.users} learners`} />
      </div>

      <Card title="Daily sign-ups · last 30 days">
        <SignupChart series={s.series} />
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Sign-in providers">
          {s.providers.length === 0 ? (
            <Empty>No accounts yet.</Empty>
          ) : (
            <ul className="space-y-3">
              {s.providers.map((p) => {
                const share = totalProviderUsers ? (p.users / totalProviderUsers) * 100 : 0;
                return (
                  <li key={p.provider}>
                    <div className="mb-1 flex justify-between text-[13px]">
                      <span className="text-fg">{providerLabel[p.provider] ?? p.provider}</span>
                      <span className="font-mono text-muted tabular-nums">
                        {formatNumber(p.users)} · {Math.round(share)}%
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-surface-3">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card title="Lessons completed">
          <p className="mb-4 text-[13px] text-muted">
            <span className="text-[22px] font-semibold text-fg tabular-nums">{formatNumber(s.lessons.total)}</span>{" "}
            completions by {formatNumber(s.lessons.learners)} learners
          </p>
          {s.lessons.top.length === 0 ? (
            <Empty>No synced lesson completions yet.</Empty>
          ) : (
            <Table
              head={["Top lessons", "Done"]}
              rows={s.lessons.top.map((l) => {
                const meta = getLesson(l.lesson);
                return [meta ? `${meta.n} ${meta.title}` : l.lesson, formatNumber(l.n)];
              })}
            />
          )}
        </Card>

        <Card title="Drills">
          {s.drills.length === 0 ? (
            <Empty>No synced drill progress yet.</Empty>
          ) : (
            <Table
              head={["Drill", "Started", "Completed", "Rate"]}
              rows={s.drills.map((l) => [
                getDrillMeta(l.drill)?.product ?? l.drill,
                formatNumber(l.started),
                formatNumber(l.completed),
                pct(l.completed, l.started),
              ])}
            />
          )}
        </Card>

        <Card title="Load tests">
          <p className="mb-4 text-[13px] text-muted">
            <span className="text-[22px] font-semibold text-fg tabular-nums">{formatNumber(s.loadTests.n)}</span> runs
            by {formatNumber(s.loadTests.users)} learners · {pct(s.loadTests.passed, s.loadTests.n)} passed
          </p>
          {s.loadTests.byStep.length === 0 ? (
            <Empty>No load tests run yet.</Empty>
          ) : (
            <Table
              head={["Drill · step", "Runs", "Pass rate", "Median p99"]}
              rows={s.loadTests.byStep.map((r) => [
                `${getDrillMeta(r.drill)?.product ?? r.drill} · ${r.step}`,
                formatNumber(r.n),
                pct(r.passed, r.n),
                `${Math.round(r.p99)} ms`,
              ])}
            />
          )}
        </Card>
      </div>

      <p className="flex flex-wrap items-center gap-1.5 pt-2 text-[13px] text-subtle">
        These numbers come from Postgres and only cover signed-in learners. Behavioural analytics (page views, funnels,
        lesson and drill events, session replays) live in PostHog.
        {posthogHost && (
          <a
            href={posthogHost}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-accent underline-offset-3 hover:underline"
          >
            Open PostHog <ExternalLink className="size-3.5" aria-hidden />
          </a>
        )}
      </p>
    </div>
  );
}

/** Reads the session, so it must render inside the Suspense boundary. */
async function AdminGate() {
  const session = await getServerSession();
  if (!isAdmin(session?.user.email)) notFound();
  const stats = await getAdminStats();
  return (
    <>
      <header className="mb-8">
        <p className="text-[13px] text-accent">Admin</p>
        <h1 className="mt-2 text-[30px] font-semibold tracking-tight text-fg">Wirebox stats</h1>
      </header>
      <Dashboard s={stats} />
    </>
  );
}

function Skeleton() {
  return (
    <div className="space-y-4" aria-busy>
      <div className="mb-8 h-16" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-[104px] animate-pulse rounded-2xl bg-surface" />
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-surface" />
    </div>
  );
}

export default function AdminPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
      <Suspense fallback={<Skeleton />}>
        <AdminGate />
      </Suspense>
    </div>
  );
}
