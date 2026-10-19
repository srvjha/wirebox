import "server-only";
import { allLessons, course, type FlatLesson } from "@/content/course";
import { getLabMeta } from "@/content/labs/catalog";
import { liveLessonSlugs } from "@/content/lessons/live";
import type { NavLesson, NavPart } from "./types";

export function lessonHref(lesson: { slug: string; kind: string; lab?: string }) {
  return lesson.kind === "lab" && lesson.lab ? `/drills/${lesson.lab}` : `/learn/${lesson.slug}`;
}

/** A lab lesson is live when its lab is; any other lesson when its MDX file exists. */
export function isLive(lesson: { slug: string; kind: string; lab?: string }, live = liveLessonSlugs()) {
  if (lesson.kind === "lab") return !!lesson.lab && getLabMeta(lesson.lab)?.status === "live";
  return live.has(lesson.slug);
}

export function getCourseNav(): NavPart[] {
  const live = liveLessonSlugs();
  return course.map((part) => ({
    n: part.n,
    title: part.title,
    summary: part.summary,
    modules: part.modules.map((m) => ({
      n: m.n,
      slug: m.slug,
      title: m.title,
      summary: m.summary,
      story: m.story,
      outcome: m.outcome,
      lessons: m.lessons.map(
        (l, i): NavLesson => ({
          slug: l.slug,
          title: l.title,
          kind: l.kind,
          minutes: l.minutes,
          summary: l.summary,
          n: `${m.n}.${i + 1}`,
          live: isLive(l, live),
          href: lessonHref(l),
        }),
      ),
    })),
  }));
}

export type NeighbourLink = { slug: string; title: string; href: string; n: string; kind: string; moduleTitle: string };

const toLink = (l: FlatLesson): NeighbourLink => ({
  slug: l.slug,
  title: l.title,
  href: lessonHref(l),
  n: l.n,
  kind: l.kind,
  moduleTitle: l.module.title,
});

/**
 * Previous and next *live* lessons, plus the unwritten ones skipped on the way
 * so the page can list them as "coming soon".
 */
export function getNeighbours(slug: string) {
  const live = liveLessonSlugs();
  const i = allLessons.findIndex((l) => l.slug === slug);
  let prev: NeighbourLink | null = null;
  for (let j = i - 1; j >= 0; j--) {
    if (isLive(allLessons[j], live)) {
      prev = toLink(allLessons[j]);
      break;
    }
  }
  let next: NeighbourLink | null = null;
  const skipped: NeighbourLink[] = [];
  for (let j = i + 1; j < allLessons.length; j++) {
    if (isLive(allLessons[j], live)) {
      next = toLink(allLessons[j]);
      break;
    }
    skipped.push(toLink(allLessons[j]));
  }
  return { prev, next, skipped };
}
