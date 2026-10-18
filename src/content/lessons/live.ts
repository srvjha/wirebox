import "server-only";
import fs from "node:fs";
import path from "node:path";

/**
 * A lesson is live when src/content/lessons/<slug>.mdx exists. Reading the
 * directory (instead of a hand-kept registry) means writers only add files.
 */
export function liveLessonSlugs(): Set<string> {
  const dir = path.join(process.cwd(), "src/content/lessons");
  try {
    return new Set(
      fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".mdx"))
        .map((f) => f.replace(/\.mdx$/, "")),
    );
  } catch {
    return new Set();
  }
}
