import { createHash } from "node:crypto";
import { and, count, eq, gte } from "drizzle-orm";
import { z } from "zod";
import { getProvider } from "@/lib/ai";
import { db } from "@/lib/db";
import { postmortem } from "@/lib/db/app-schema";
import { getServerSession } from "@/lib/session";

const MAX_PER_HOUR = 20;

const Body = z.object({
  lab: z.string().min(1).max(80),
  step: z.number().int().min(0).max(100),
  design: z.string().min(1).max(8000),
  scenario: z.string().max(4000).default(""),
  result: z.string().max(4000).default(""),
});

const SYSTEM = `You are a friendly senior engineer mentoring a learner who is building a system design in a simulator.
They ran a load test and it failed. In at most 150 words, point at the bottleneck in THEIR design and name the one concept
that explains it. Do not give the full fix or list every change; nudge them toward the next move with a question or a hint.
Plain prose, no headings, no bullet lists.`;

/** Fallback when no API key is configured: restate the failed checks from the sim output. */
function rulesAnswer(result: string): string {
  const lines = result
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /fail|✗|✕|over|saturat|drop|slow|error|miss|down|exceed|bottleneck|issue/i.test(l))
    .slice(0, 5);
  if (!lines.length) {
    return "The run missed one of the scenario's goals. Look at which node turned red or filled its queue first in the timeline: that is your bottleneck. Ask what that node is waiting on, and whether work could skip it or be spread across more copies.";
  }
  return `Here is what the simulator flagged:\n\n${lines.map((l) => `- ${l.replace(/^[-*]\s*/, "")}`).join("\n")}\n\nStart with the first one. Find the node it points at and ask what is making it wait, and whether the request could avoid it or share the load.`;
}

export async function POST(req: Request) {
  const session = await getServerSession();
  if (!session) return Response.json({ error: "Sign in to ask the mentor." }, { status: 401 });

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request." }, { status: 400 });
  const { lab, step, design, scenario, result } = parsed.data;
  const userId = session.user.id;

  const designHash = createHash("sha256").update(`${design}\n--\n${step}`).digest("hex");
  const [hit] = await db
    .select({ response: postmortem.response, model: postmortem.model })
    .from(postmortem)
    .where(
      and(
        eq(postmortem.userId, userId),
        eq(postmortem.labSlug, lab),
        eq(postmortem.step, step),
        eq(postmortem.designHash, designHash),
      ),
    )
    .limit(1);
  if (hit) {
    return Response.json({ text: hit.response, source: hit.model === "rules" ? "rules" : "ai", cached: true });
  }

  const provider = getProvider();
  if (!provider) {
    return Response.json({ text: rulesAnswer(result), source: "rules" });
  }

  const [{ n }] = await db
    .select({ n: count() })
    .from(postmortem)
    .where(and(eq(postmortem.userId, userId), gte(postmortem.createdAt, new Date(Date.now() - 3600_000))));
  if (n >= MAX_PER_HOUR) {
    return Response.json({ error: "You have asked the mentor a lot this hour. Try again later." }, { status: 429 });
  }

  const model = `${provider.id}:${provider.model}`;
  try {
    const text = (
      await provider.complete({
        system: SYSTEM,
        prompt: `Scenario:\n${scenario}\n\nLearner's design:\n${design}\n\nLoad test result:\n${result}`,
        maxTokens: 400,
      })
    ).trim();
    if (!text) throw new Error("empty response");
    await db.insert(postmortem).values({ userId, labSlug: lab, step, designHash, response: text, model });
    return Response.json({ text, source: "ai" });
  } catch (err) {
    console.error("postmortem failed", err);
    return Response.json({ text: rulesAnswer(result), source: "rules" });
  }
}
