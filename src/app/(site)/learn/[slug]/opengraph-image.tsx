import { allLessons, getLesson } from "@/content/course";
import { liveLessonSlugs } from "@/content/lessons/live";
import { OG_SIZE, ogCard } from "@/lib/og-card";

export const alt = "A Wirebox system design lesson";
export const size = OG_SIZE;
export const contentType = "image/png";

export function generateStaticParams() {
  const live = liveLessonSlugs();
  return allLessons.filter((l) => l.kind !== "drill" && live.has(l.slug)).map((l) => ({ slug: l.slug }));
}

const kindLabel = { read: "Read", visual: "Interactive", drill: "Drill" } as const;

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) return ogCard({ eyebrow: "Lesson", title: "Wirebox", summary: "Learn system design by building it.", footer: [] });
  return ogCard({
    eyebrow: `Lesson ${lesson.n} · ${lesson.module.title}`,
    title: lesson.title,
    summary: lesson.summary,
    footer: [kindLabel[lesson.kind], `${lesson.minutes} min`, `Part ${lesson.part.n}: ${lesson.part.title}`],
  });
}
