import { notFound } from "next/navigation";
import { LessonProvider } from "@/components/lesson";
import { allLessons, getLesson } from "@/content/course";
import { liveLessonSlugs } from "@/content/lessons/live";

// Minimal renderer; the full lesson layout (sidebar, chapters, progress) is built in feat/learn.
export function generateStaticParams() {
  const live = liveLessonSlugs();
  return allLessons.filter((l) => live.has(l.slug)).map((l) => ({ slug: l.slug }));
}


export default async function LessonPage({ params }: PageProps<"/learn/[slug]">) {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson || !liveLessonSlugs().has(slug)) notFound();
  const { default: Content } = await import(`@/content/lessons/${slug}.mdx`);
  return (
    <LessonProvider slug={slug} module={lesson.module.slug}>
      <article className="prose-lesson mx-auto max-w-[680px] px-4 py-14">
        <h1 className="text-3xl font-semibold tracking-tight text-fg">{lesson.title}</h1>
        <Content />
      </article>
    </LessonProvider>
  );
}
