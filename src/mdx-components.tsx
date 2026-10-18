import type { MDXComponents } from "mdx/types";
import Link from "next/link";
import type { ComponentProps } from "react";
import { Box, Diagram, Group, Packet, Tag, Text, Wire } from "@/components/diagram/kit";
import { slugify } from "@/components/learn/slugify";
import { Callout, KeyIdea, Quiz, Reveal, YourTurn } from "@/components/lesson";

export { slugify };

function textOf(node: unknown): string {
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  if (node && typeof node === "object" && "props" in node) {
    return textOf((node as { props: { children?: unknown } }).props.children);
  }
  return "";
}

const components: MDXComponents = {
  h2: (props: ComponentProps<"h2">) => <h2 id={slugify(textOf(props.children))} {...props} />,
  h3: (props: ComponentProps<"h3">) => <h3 id={slugify(textOf(props.children))} {...props} />,
  // Internal links navigate client-side; external ones open in a new tab.
  a: ({ href = "", ...props }: ComponentProps<"a">) =>
    href.startsWith("/") ? (
      <Link href={href} {...props} />
    ) : href.startsWith("#") ? (
      <a href={href} {...props} />
    ) : (
      <a href={href} target="_blank" rel="noreferrer" {...props} />
    ),
  // Available in every lesson without importing.
  Diagram,
  Box,
  Wire,
  Packet,
  Text,
  Group,
  Tag,
  Callout,
  KeyIdea,
  Quiz,
  Reveal,
  YourTurn,
};

export function useMDXComponents(): MDXComponents {
  return components;
}
