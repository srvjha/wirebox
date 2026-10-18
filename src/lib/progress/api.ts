/**
 * The /api/progress contract, shared by the route handler and the client.
 *
 * GET  /api/progress -> { lessons: string[] }   (401 when signed out)
 * PUT  /api/progress  { lesson, done }           mark one lesson done or not done
 *                     { lessons: string[] }      add many (used to merge local progress)
 *                  -> { lessons: string[] }
 */

export type ProgressResponse = { lessons: string[] };

export type ProgressUpdate = { lesson: string; done: boolean } | { lessons: string[] };

export async function fetchProgress(): Promise<ProgressResponse> {
  const res = await fetch("/api/progress", { credentials: "same-origin" });
  if (!res.ok) throw new Error(`GET /api/progress failed: ${res.status}`);
  return res.json();
}

export async function putProgress(update: ProgressUpdate): Promise<ProgressResponse> {
  const res = await fetch("/api/progress", {
    method: "PUT",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(update),
  });
  if (!res.ok) throw new Error(`PUT /api/progress failed: ${res.status}`);
  return res.json();
}
