import { z } from "zod";
import { getLab } from "@/content/labs";
import { db } from "@/lib/db";
import { loadTestRun } from "@/lib/db/app-schema";
import { getServerSession } from "@/lib/session";

const body = z.object({
  step: z.number().int().min(0).max(200),
  pass: z.boolean(),
  successRate: z.number().min(0).max(1),
  p99Ms: z.number().min(0).max(100_000),
  costUsd: z.number().min(0).max(10_000_000),
  nodes: z.number().int().min(0).max(1_000),
});

/** Records one load test for a signed-in learner (feeds the admin dashboard). */
export async function POST(req: Request, ctx: RouteContext<"/api/labs/[slug]/runs">) {
  const { slug } = await ctx.params;
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Sign in to record runs." }, { status: 401 });
  if (!getLab(slug)) return Response.json({ error: "Unknown lab." }, { status: 404 });

  const parsed = body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Invalid run." }, { status: 400 });
  const r = parsed.data;
  await db.insert(loadTestRun).values({
    userId: session.user.id,
    labSlug: slug,
    step: r.step,
    pass: r.pass,
    successRate: r.successRate,
    p99Ms: Math.round(r.p99Ms),
    costUsd: Math.round(r.costUsd),
    nodes: r.nodes,
  });
  return Response.json({ ok: true }, { status: 201 });
}
