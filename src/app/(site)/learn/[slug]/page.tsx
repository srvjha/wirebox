import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChevronRight, Clock, ListOrdered } from "lucide-react";
import { getChapters } from "@/components/learn/chapters";
import { KindIcon, kindLabel } from "@/components/learn/kind-icon";
import { LearnSidebar } from "@/components/learn/learn-sidebar";
import { ChapterList, LessonStatus, LessonView, OnThisPage } from "@/components/learn/lesson-chrome";
import { LessonComplete } from "@/components/learn/lesson-complete";
import { LessonPager } from "@/components/learn/lesson-pager";
import { getCourseNav, getNeighbours } from "@/components/learn/nav";
import { LessonProvider } from "@/components/lesson";
import { allLessons, getLesson } from "@/content/course";
import { liveLessonSlugs } from "@/content/lessons/live";

export function generateStaticParams() {
  const live = liveLessonSlugs();
  return allLessons.filter((l) => l.kind !== "drill" && live.has(l.slug)).map((l) => ({ slug: l.slug }));
}

export async function generateMetadata({ params }: PageProps<"/learn/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const lesson = getLesson(slug);
  if (!lesson) return {};
  return {
    title: lesson.title,
    description: lesson.summary,
    openGraph: { title: lesson.title, description: lesson.summary, type: "article" },
  };
}

// Params are read inside Suspense so the shared App Shell can render instantly on
// navigation; every lesson is still prerendered via generateStaticParams.
export default function LessonPage({ params }: PageProps<"/learn/[slug]">) {
  return (
    <Suspense fallback={<LessonSkeleton />}>
      {params.then(({ slug }) => (
        <Lesson slug={slug} />
      ))}
    </Suspense>
  );
}

function LessonSkeleton() {
  return (
    <div className="mx-auto w-full max-w-[680px] animate-pulse px-4 pt-12" aria-hidden>
      <div className="h-3 w-48 rounded bg-surface-2" />
      <div className="mt-8 h-9 w-3/4 rounded bg-surface-2" />
      <div className="mt-4 h-4 w-full rounded bg-surface-2" />
      <div className="mt-2 h-4 w-5/6 rounded bg-surface-2" />
    </div>
  );
}

async function Lesson({ slug }: { slug: string }) {
  const lesson = getLesson(slug);
  if (!lesson || lesson.kind === "drill" || !liveLessonSlugs().has(slug)) notFound();
  const { default: Content } = await import(`@/content/lessons/${slug}.mdx`);

  const parts = getCourseNav();
  const navModule = parts.flatMap((p) => p.modules).find((m) => m.slug === lesson.module.slug)!;
  const chapters = getChapters(slug);
  const { prev, next, skipped } = getNeighbours(slug);

  return (
    <LessonProvider slug={slug} module={lesson.module.slug}>
      <LessonView slug={slug} module={lesson.module.slug} kind={lesson.kind} />
      <div className="mx-auto w-full max-w-[1440px] lg:flex">
        <LearnSidebar parts={parts} current={slug} />
        <div className="min-w-0 flex-1 px-4 sm:px-6 lg:px-10">
          <div className="mx-auto flex max-w-[680px] justify-center gap-12 xl:max-w-none">
            <article id="lesson-article" className="w-full max-w-[680px] min-w-0 pt-8 pb-16 sm:pt-12">
              <header>
                <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[12.5px] text-subtle">
                  <Link href="/learn" className="hover:text-fg">
                    Learn
                  </Link>
                  <ChevronRight className="size-3" />
                  <Link href={`/learn#part-${lesson.part.n}`} className="hover:text-fg">
                    Part {lesson.part.n} · {lesson.part.title}
                  </Link>
                  <ChevronRight className="size-3" />
                  <Link href={`/learn#${lesson.module.slug}`} className="hover:text-fg">
                    {lesson.module.title}
                  </Link>
                </nav>
                <p className="mt-6 font-mono text-[11.5px] tracking-wider text-accent uppercase">
                  Module {lesson.module.n} · Lesson {lesson.index + 1} of {lesson.module.lessons.length}
                </p>
                <h1 className="mt-2 text-[2rem] leading-[1.15] font-semibold tracking-tight text-balance text-fg sm:text-[2.4rem]">
                  {lesson.title}
                </h1>
                <p className="mt-3 text-[17px] leading-relaxed text-pretty text-muted">{lesson.summary}</p>
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-2 text-[13px] text-subtle">
                  <span className="inline-flex items-center gap-1.5">
                    <Clock className="size-3.5" /> {lesson.minutes} min read
                  </span>
                  {chapters.length > 0 && (
                    <span className="inline-flex items-center gap-1.5">
                      <ListOrdered className="size-3.5" /> {chapters.length} chapters
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1.5">
                    <KindIcon kind={lesson.kind} /> {kindLabel[lesson.kind]}
                  </span>
                  <LessonStatus slug={slug} />
                </div>
              </header>

              <ChapterList slug={slug} chapters={chapters} />

              <div className="prose-lesson mt-10 [&_h2]:scroll-mt-28! lg:[&_h2]:scroll-mt-20! [&_h3]:scroll-mt-28! lg:[&_h3]:scroll-mt-20!">
                <Content />
              </div>

              <LessonComplete slug={slug} module={navModule} />
              <LessonPager prev={prev} next={next} skipped={skipped} />
            </article>

            <aside className="hidden w-56 shrink-0 xl:block">
              <div className="sticky top-14 max-h-[calc(100dvh-3.5rem)] overflow-y-auto pt-12 pb-8">
                <OnThisPage slug={slug} chapters={chapters} />
              </div>
            </aside>
          </div>
        </div>
      </div>
    </LessonProvider>
  );
}
