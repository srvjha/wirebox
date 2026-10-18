import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { allLessons } from "@/content/course";
import { db } from "@/lib/db";
import { lessonProgress } from "@/lib/db/app-schema";
import type { ProgressResponse } from "@/lib/progress/api";
import { getServerSession } from "@/lib/session";

const knownSlugs = new Set(allLessons.map((l) => l.slug));
const slug = z.string().min(1).max(120);

const body = z.union([
  z.object({ lesson: slug, done: z.boolean() }),
  z.object({ lessons: z.array(slug).max(500) }),
]);

async function completedFor(userId: string): Promise<ProgressResponse> {
  const rows = await db
    .select({ lesson: lessonProgress.lessonId })
    .from(lessonProgress)
    .where(eq(lessonProgress.userId, userId))
    .orderBy(asc(lessonProgress.completedAt));
  return { lessons: rows.map((r) => r.lesson) };
}

const unauthorized = () => Response.json({ lessons: [], error: "unauthorized" }, { status: 401 });

/** The signed-in learner's completed lessons: `{ lessons: string[] }`. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return unauthorized();
  return Response.json(await completedFor(session.user.id), { headers: { "cache-control": "no-store" } });
}

/** `{ lesson, done }` toggles one lesson; `{ lessons }` adds many (merging local progress). */
export async function PUT(request: Request) {
  const session = await getServerSession();
  if (!session) return unauthorized();
  const userId = session.user.id;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "invalid body" }, { status: 400 });
  const input = parsed.data;

  if ("lesson" in input) {
    if (!knownSlugs.has(input.lesson)) return Response.json({ error: "unknown lesson" }, { status: 400 });
    if (input.done) {
      await db.insert(lessonProgress).values({ userId, lessonId: input.lesson }).onConflictDoNothing();
    } else {
      await db
        .delete(lessonProgress)
        .where(and(eq(lessonProgress.userId, userId), eq(lessonProgress.lessonId, input.lesson)));
    }
  } else {
    const lessons = [...new Set(input.lessons)].filter((s) => knownSlugs.has(s));
    if (lessons.length) {
      await db
        .insert(lessonProgress)
        .values(lessons.map((lessonId) => ({ userId, lessonId })))
        .onConflictDoNothing();
    }
  }

  return Response.json(await completedFor(userId));
}
