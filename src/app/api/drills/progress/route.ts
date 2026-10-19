import { desc, eq } from "drizzle-orm";
import { getDrill } from "@/content/drills";
import { db } from "@/lib/db";
import { drillProgress } from "@/lib/db/app-schema";
import { getServerSession } from "@/lib/session";

export type DrillProgressSummary = {
  slug: string;
  stepsDone: number;
  totalSteps: number;
  completedAt: string | null;
  updatedAt: string;
};

/** Every drill the signed-in learner has touched. The /me page relies on this shape. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Sign in to see drill progress." }, { status: 401 });

  const rows = await db
    .select({
      slug: drillProgress.drillSlug,
      stepsDone: drillProgress.stepsDone,
      completedAt: drillProgress.completedAt,
      updatedAt: drillProgress.updatedAt,
    })
    .from(drillProgress)
    .where(eq(drillProgress.userId, session.user.id))
    .orderBy(desc(drillProgress.updatedAt));

  const out: DrillProgressSummary[] = rows.flatMap((r) => {
    const drill = getDrill(r.slug);
    if (!drill) return [];
    return [
      {
        slug: r.slug,
        stepsDone: r.stepsDone,
        totalSteps: drill.steps.length,
        completedAt: r.completedAt?.toISOString() ?? null,
        updatedAt: r.updatedAt.toISOString(),
      },
    ];
  });
  return Response.json({ drills: out });
}
