import "server-only";
import fs from "node:fs";
import path from "node:path";
import { slugify } from "./slugify";

export type Chapter = { id: string; title: string };

/** Markdown inline syntax to plain text, matching what the MDX renderer outputs. */
function plain(md: string) {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(\*|_)(.+?)\1/g, "$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim();
}

/**
 * The `## ` headings of a lesson, read from its MDX source at build time.
 * Ids use the same slugify as the h2 renderer in src/mdx-components.tsx.
 */
export function getChapters(slug: string): Chapter[] {
  let src: string;
  try {
    src = fs.readFileSync(path.join(process.cwd(), "src/content/lessons", `${slug}.mdx`), "utf8");
  } catch {
    return [];
  }
  const chapters: Chapter[] = [];
  let fenced = false;
  for (const line of src.split("\n")) {
    if (/^\s*(```|~~~)/.test(line)) fenced = !fenced;
    if (fenced) continue;
    const m = /^##\s+(.+?)\s*#*\s*$/.exec(line);
    if (m) {
      const title = plain(m[1]);
      chapters.push({ id: slugify(title), title });
    }
  }
  return chapters;
}
