import type { MetadataRoute } from "next";
import { allLessons } from "@/content/course";
import { labCatalog } from "@/content/labs/catalog";
import { liveLessonSlugs } from "@/content/lessons/live";
import { SITE } from "@/lib/utils";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url.replace(/\/$/, "");
  const live = liveLessonSlugs();
  return [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/learn`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/labs`, changeFrequency: "weekly", priority: 0.8 },
    ...allLessons
      .filter((l) => live.has(l.slug))
      .map((l) => ({ url: `${base}/learn/${l.slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    ...labCatalog
      .filter((l) => l.status === "live")
      .map((l) => ({ url: `${base}/labs/${l.slug}`, changeFrequency: "monthly" as const, priority: 0.7 })),
    { url: `${base}/sign-in`, changeFrequency: "yearly", priority: 0.2 },
  ];
}
