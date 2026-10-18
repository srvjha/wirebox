/** Heading anchor ids. Shared by the MDX h2/h3 renderer and the chapter extractor. */
export function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}
