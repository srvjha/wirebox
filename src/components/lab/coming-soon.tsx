import { ArrowLeft, FlaskConical } from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/site/logo";
import { Badge } from "@/components/ui/badge";
import { LinkButton } from "@/components/ui/button";
import { labCatalog, type LabMeta } from "@/content/labs/catalog";

export function ComingSoon({ lab }: { lab: LabMeta }) {
  const live = labCatalog.filter((l) => l.status === "live");
  return (
    <div className="bg-dots flex min-h-dvh flex-1 flex-col">
      <header className="flex h-14 items-center gap-3 border-b border-line bg-bg/80 px-4 backdrop-blur">
        <Link href="/" aria-label="Wirebox home" className="text-fg">
          <LogoMark className="size-5" />
        </Link>
        <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[13px]">
          <Link href="/labs" className="text-muted hover:text-fg">
            Labs
          </Link>
          <span className="text-subtle">/</span>
          <span className="font-medium text-fg">{lab.product}</span>
        </nav>
      </header>
      <main className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-[560px] rounded-2xl border border-line bg-surface p-6 shadow-card sm:p-8">
          <div className="flex items-center gap-2">
            <span className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent">
              <FlaskConical className="size-5" />
            </span>
            <Badge tone="accent">Coming soon</Badge>
            <Badge>{lab.difficulty}</Badge>
          </div>
          <h1 className="mt-5 text-[26px] leading-tight font-semibold tracking-tight text-fg">{lab.title}</h1>
          <p className="mt-2 text-[15.5px] leading-relaxed text-muted">{lab.tagline}</p>
          <p className="mt-6 font-mono text-[10.5px] tracking-wider text-subtle uppercase">You&apos;ll practise</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {lab.concepts.map((c) => (
              <li key={c} className="rounded-full border border-line bg-surface-2 px-3 py-1 text-[13px] text-fg">
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-[14px] leading-relaxed text-muted">
            We&apos;re still calibrating the simulator for this one (about {lab.minutes} minutes when it lands).
            {live.length > 0 && " Meanwhile, the live labs use the same canvas and load tests."}
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            {live.map((l) => (
              <LinkButton key={l.slug} href={`/labs/${l.slug}`}>
                Try the {l.product.toLowerCase()} lab
              </LinkButton>
            ))}
            <LinkButton href="/labs" variant="secondary">
              <ArrowLeft className="size-4" /> All labs
            </LinkButton>
          </div>
        </div>
      </main>
    </div>
  );
}
