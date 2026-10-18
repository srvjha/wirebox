"use client";

import { createContext, useContext, type ReactNode } from "react";

const LessonContext = createContext<{ slug: string; module: string }>({ slug: "unknown", module: "unknown" });

export function LessonProvider({ slug, module, children }: { slug: string; module: string; children: ReactNode }) {
  return <LessonContext value={{ slug, module }}>{children}</LessonContext>;
}

export function useLesson() {
  return useContext(LessonContext);
}
