import type { LessonKind } from "@/content/course";

/** Serializable course tree handed from server pages to client components. */
export type NavLesson = {
  slug: string;
  title: string;
  kind: LessonKind;
  minutes: number;
  summary: string;
  /** "3.2" style number */
  n: string;
  /** Written (MDX exists) or, for drills, playable. */
  live: boolean;
  /** /learn/<slug>, or /drills/<drill> for drill lessons. */
  href: string;
};

export type NavModule = {
  n: number;
  slug: string;
  title: string;
  summary: string;
  story: string;
  outcome: string;
  lessons: NavLesson[];
};

export type NavPart = {
  n: number;
  title: string;
  summary: string;
  modules: NavModule[];
};
