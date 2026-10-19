import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ComingSoon } from "@/components/drill/coming-soon";
import { DrillPlayer } from "@/components/drill/player/drill-player";
import { getDrill } from "@/content/drills";
import { getDrillMeta, drillCatalog } from "@/content/drills/catalog";

// Live drills and "coming soon" pages are all prerendered.
export function generateStaticParams() {
  return drillCatalog.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: PageProps<"/drills/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const meta = getDrillMeta(slug);
  if (!meta) return {};
  return { title: meta.title, description: meta.tagline };
}

// Params are read inside Suspense so navigation stays instant; pages are still prerendered.
export default function DrillPage({ params }: PageProps<"/drills/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" aria-hidden />}>
      {params.then(({ slug }) => (
        <Drill slug={slug} />
      ))}
    </Suspense>
  );
}

function Drill({ slug }: { slug: string }) {
  const meta = getDrillMeta(slug);
  if (!meta) notFound();
  if (!getDrill(slug)) return <ComingSoon drill={meta} />;
  return <DrillPlayer slug={slug} />;
}
