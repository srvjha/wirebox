import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getLab } from "@/content/labs";
import { db } from "@/lib/db";
import { labProgress } from "@/lib/db/app-schema";
import { getServerSession } from "@/lib/session";

const body = z.object({
  version: z.number().int(),
  // The learner's whole lab save; shape is owned by the client store.
  state: z.looseObject({ updatedAt: z.number(), passed: z.array(z.string()) }),
  stepsDone: z.number().int().min(0),
  completedAt: z.iso.datetime().nullable(),
});

const MAX_STATE_BYTES = 200_000;

export async function GET(_req: Request, ctx: RouteContext<"/api/labs/[slug]/progress">) {
  const { slug } = await ctx.params;
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Sign in to sync drill progress." }, { status: 401 });
  if (!getLab(slug)) return Response.json({ error: "Unknown drill." }, { status: 404 });

  const [row] = await db
    .select()
    .from(labProgress)
    .where(and(eq(labProgress.userId, session.user.id), eq(labProgress.labSlug, slug)));
  if (!row) return Response.json(null);
  return Response.json({
    state: row.state,
    version: row.labVersion,
    stepsDone: row.stepsDone,
    completedAt: row.completedAt?.toISOString() ?? null,
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function PUT(req: Request, ctx: RouteContext<"/api/labs/[slug]/progress">) {
  const { slug } = await ctx.params;
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Sign in to sync drill progress." }, { status: 401 });
  const lab = getLab(slug);
  if (!lab) return Response.json({ error: "Unknown drill." }, { status: 404 });

  const text = await req.text();
  if (text.length > MAX_STATE_BYTES) return Response.json({ error: "Progress is too large." }, { status: 413 });
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return Response.json({ error: "Invalid JSON." }, { status: 400 });
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return Response.json({ error: "Invalid progress." }, { status: 400 });
  const { version, state, stepsDone, completedAt } = parsed.data;
  if (version !== lab.version) return Response.json({ error: "This drill has a newer version." }, { status: 409 });

  const now = new Date();
  const values = {
    labVersion: version,
    state,
    stepsDone: Math.min(stepsDone, lab.steps.length),
    completedAt: completedAt ? new Date(completedAt) : null,
    updatedAt: now,
  };
  await db
    .insert(labProgress)
    .values({ userId: session.user.id, labSlug: slug, ...values })
    .onConflictDoUpdate({ target: [labProgress.userId, labProgress.labSlug], set: values });
  return Response.json({ ok: true, updatedAt: now.toISOString() });
}
