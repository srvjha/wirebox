import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ComingSoon } from "@/components/lab/coming-soon";
import { LabPlayer } from "@/components/lab/player/lab-player";
import { getLab } from "@/content/labs";
import { getLabMeta, labCatalog } from "@/content/labs/catalog";

// Live labs and "coming soon" pages are all prerendered.
export function generateStaticParams() {
  return labCatalog.map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: PageProps<"/labs/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const meta = getLabMeta(slug);
  if (!meta) return {};
  return { title: meta.title, description: meta.tagline };
}

// Params are read inside Suspense so navigation stays instant; pages are still prerendered.
export default function LabPage({ params }: PageProps<"/labs/[slug]">) {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-bg" aria-hidden />}>
      {params.then(({ slug }) => (
        <Lab slug={slug} />
      ))}
    </Suspense>
  );
}

function Lab({ slug }: { slug: string }) {
  const meta = getLabMeta(slug);
  if (!meta) notFound();
  if (!getLab(slug)) return <ComingSoon lab={meta} />;
  return <LabPlayer slug={slug} />;
}
