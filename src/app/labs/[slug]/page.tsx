import type { Metadata } from "next";
import { notFound } from "next/navigation";
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

export default async function LabPage({ params }: PageProps<"/labs/[slug]">) {
  const { slug } = await params;
  const meta = getLabMeta(slug);
  if (!meta) notFound();
  if (!getLab(slug)) return <ComingSoon lab={meta} />;
  return <LabPlayer slug={slug} />;
}
