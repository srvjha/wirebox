import "server-only";
import { and, count, countDistinct, desc, gte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { drillProgress, lessonProgress, loadTestRun, postmortem } from "@/lib/db/schema";
import { authIdentities, authUsers } from "@/lib/db/supabase-auth";

const daysAgo = (d: number) => new Date(Date.now() - d * 86_400_000);

export type AdminStats = Awaited<ReturnType<typeof getAdminStats>>;

export async function getAdminStats() {
  const since30 = daysAgo(30);

  const [
    [users],
    signupsByDay,
    providers,
    activeRows,
    [lessonsTotal],
    topLessons,
    drills,
    [loadTotals],
    loadByStep,
    [postmortems],
  ] = await Promise.all([
    db
      .select({
        // Guest accounts are counted separately so they don't inflate real sign-ups.
        total: sql<number>`count(*) filter (where ${authUsers.isAnonymous} is not true)`.mapWith(Number),
        guests: sql<number>`count(*) filter (where ${authUsers.isAnonymous})`.mapWith(Number),
        d1: sql<number>`count(*) filter (where ${authUsers.isAnonymous} is not true and ${authUsers.createdAt} >= now() - interval '1 day')`.mapWith(Number),
        d7: sql<number>`count(*) filter (where ${authUsers.isAnonymous} is not true and ${authUsers.createdAt} >= now() - interval '7 days')`.mapWith(Number),
        d30: sql<number>`count(*) filter (where ${authUsers.isAnonymous} is not true and ${authUsers.createdAt} >= now() - interval '30 days')`.mapWith(Number),
      })
      .from(authUsers),
    db
      .select({
        day: sql<string>`to_char(date_trunc('day', ${authUsers.createdAt}), 'YYYY-MM-DD')`,
        n: count(),
      })
      .from(authUsers)
      .where(and(gte(authUsers.createdAt, since30), sql`${authUsers.isAnonymous} is not true`))
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({ provider: authIdentities.provider, users: countDistinct(authIdentities.userId) })
      .from(authIdentities)
      .groupBy(authIdentities.provider)
      .orderBy(desc(countDistinct(authIdentities.userId))),
    db.execute<{ n: number }>(sql`
      select count(distinct user_id)::int as n from (
        select ${lessonProgress.userId} as user_id from ${lessonProgress} where ${lessonProgress.completedAt} >= now() - interval '7 days'
        union select ${drillProgress.userId} from ${drillProgress} where ${drillProgress.updatedAt} >= now() - interval '7 days'
        union select ${loadTestRun.userId} from ${loadTestRun} where ${loadTestRun.createdAt} >= now() - interval '7 days'
      ) active
    `),
    db.select({ n: count(), learners: countDistinct(lessonProgress.userId) }).from(lessonProgress),
    db
      .select({ lesson: lessonProgress.lessonId, n: count() })
      .from(lessonProgress)
      .groupBy(lessonProgress.lessonId)
      .orderBy(desc(count()), lessonProgress.lessonId)
      .limit(10),
    db
      .select({
        drill: drillProgress.drillSlug,
        started: count(),
        completed: count(drillProgress.completedAt),
      })
      .from(drillProgress)
      .groupBy(drillProgress.drillSlug)
      .orderBy(desc(count())),
    db
      .select({
        n: count(),
        passed: sql<number>`count(*) filter (where ${loadTestRun.pass})`.mapWith(Number),
        users: countDistinct(loadTestRun.userId),
      })
      .from(loadTestRun),
    db
      .select({
        drill: loadTestRun.drillSlug,
        step: loadTestRun.step,
        n: count(),
        passed: sql<number>`count(*) filter (where ${loadTestRun.pass})`.mapWith(Number),
        p99: sql<number>`percentile_cont(0.5) within group (order by ${loadTestRun.p99Ms})`.mapWith(Number),
      })
      .from(loadTestRun)
      .groupBy(loadTestRun.drillSlug, loadTestRun.step)
      .orderBy(loadTestRun.drillSlug, loadTestRun.step),
    db.select({ n: count(), users: countDistinct(postmortem.userId) }).from(postmortem),
  ]);

  // Fill the 30-day series so empty days still get a bar.
  const byDay = new Map(signupsByDay.map((r) => [r.day, r.n]));
  const series: { day: string; n: number }[] = [];
  for (let i = 29; i >= 0; i--) {
    const d = daysAgo(i).toISOString().slice(0, 10);
    series.push({ day: d, n: byDay.get(d) ?? 0 });
  }

  return {
    users,
    series,
    providers,
    activeLearners7d: Number(activeRows[0]?.n ?? 0),
    lessons: { total: lessonsTotal.n, learners: lessonsTotal.learners, top: topLessons },
    drills,
    loadTests: { ...loadTotals, byStep: loadByStep },
    postmortems,
  };
}
