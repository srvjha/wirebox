import type { Metadata } from "next";
import { Eyebrow } from "@/components/home/section";
import { LabsBrowser } from "@/components/site/labs-browser";
import { labCatalog } from "@/content/labs/catalog";

export const metadata: Metadata = {
  title: "Drills",
  description:
    "Design real products end to end: write the API, model the data, wire the architecture and load-test it. Free, in your browser.",
};

const live = labCatalog.filter((l) => l.status === "live").length;

export default function LabsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <header className="mb-10 max-w-2xl">
        <Eyebrow>Product drills</Eyebrow>
        <h1 className="mt-3 text-[34px] leading-[1.1] font-semibold tracking-tight text-fg sm:text-[44px]">
          Design it. Ship it. Break it.
        </h1>
        <p className="mt-4 text-[15.5px] leading-relaxed text-pretty text-muted">
          Each drill is a product brief and a blank canvas. You write the API, model the data and wire up the
          architecture, then a simulator throws real traffic at it, step by step, until something gives.{" "}
          <span className="text-fg">
            {live === labCatalog.length
              ? `${live} drills, all playable.`
              : `${live} live, ${labCatalog.length - live} on the way.`}
          </span>
        </p>
      </header>
      <LabsBrowser labs={labCatalog} />
    </div>
  );
}
