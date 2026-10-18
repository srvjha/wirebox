import "server-only";
import { PostHog } from "posthog-node";

let client: PostHog | null | undefined;

function getClient() {
  if (client !== undefined) return client;
  const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
  client = key
    ? new PostHog(key, {
        host: process.env.POSTHOG_HOST ?? "https://us.i.posthog.com",
        flushAt: 1,
        flushInterval: 0,
      })
    : null;
  return client;
}

export async function captureServer(
  distinctId: string,
  event: string,
  properties: Record<string, unknown> = {},
) {
  const ph = getClient();
  if (!ph) return;
  ph.capture({ distinctId, event, properties });
  await ph.flush();
}
