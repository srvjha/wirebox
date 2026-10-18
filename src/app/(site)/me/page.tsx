import type { Metadata } from "next";
import { liveLessonSlugs } from "@/content/lessons/live";
import { ProgressDashboard } from "./dashboard";

export const metadata: Metadata = {
  title: "Your progress",
  robots: { index: false },
};

export default function MePage() {
  return <ProgressDashboard liveLessons={[...liveLessonSlugs()]} />;
}
