import { desc, eq } from "drizzle-orm";
import { getLab } from "@/content/labs";
import { db } from "@/lib/db";
import { labProgress } from "@/lib/db/app-schema";
import { getServerSession } from "@/lib/session";

export type LabProgressSummary = {
  slug: string;
  stepsDone: number;
  totalSteps: number;
  completedAt: string | null;
  updatedAt: string;
};

/** Every lab the signed-in learner has touched. The /me page relies on this shape. */
export async function GET() {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Sign in to see lab progress." }, { status: 401 });

  const rows = await db
    .select({
      slug: labProgress.labSlug,
      stepsDone: labProgress.stepsDone,
      completedAt: labProgress.completedAt,
      updatedAt: labProgress.updatedAt,
    })
    .from(labProgress)
    .where(eq(labProgress.userId, session.user.id))
    .orderBy(desc(labProgress.updatedAt));

  const out: LabProgressSummary[] = rows.flatMap((r) => {
    const lab = getLab(r.slug);
    if (!lab) return [];
    return [
      {
        slug: r.slug,
        stepsDone: r.stepsDone,
        totalSteps: lab.steps.length,
        completedAt: r.completedAt?.toISOString() ?? null,
        updatedAt: r.updatedAt.toISOString(),
      },
    ];
  });
  return Response.json(out);
}
