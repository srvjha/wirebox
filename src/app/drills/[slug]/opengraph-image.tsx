import { drillCatalog, getDrillMeta } from "@/content/drills/catalog";
import { OG_SIZE, ogCard } from "@/lib/og-card";

export const alt = "A Wirebox product drill: design it, then load-test it";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  return drillCatalog.map((d) => ({ slug: d.slug }));
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const drill = getDrillMeta(slug);
  if (!drill) return ogCard({ eyebrow: "Drill", title: "Wirebox", summary: "Learn system design by building it.", footer: [] });
  return ogCard({
    eyebrow: `Product drill · ${drill.difficulty}`,
    title: drill.title,
    summary: drill.tagline,
    footer: [`${drill.minutes} min`, ...drill.concepts.slice(0, 3)],
  });
}
