import type { Metadata } from "next";
import { Eyebrow } from "@/components/home/section";
import { DrillIndex } from "@/components/site/drill-index";
import { drillCatalog } from "@/content/drills/catalog";

export const metadata: Metadata = {
  title: "Drills",
  description:
    "Design real products end to end: write the API, model the data, wire the architecture and load-test it. Free, in your browser.",
};

const live = drillCatalog.filter((l) => l.status === "live");
const hours = Math.round(live.reduce((sum, l) => sum + l.minutes, 0) / 60);

const loop = [
  { n: "01", title: "Read the brief", text: "Requirements and the numbers behind them." },
  { n: "02", title: "Shape the contract", text: "Endpoints first, then the tables they need." },
  { n: "03", title: "Wire the system", text: "Servers, caches, queues, drawn on a canvas." },
  { n: "04", title: "Take the hit", text: "Traffic spikes and outages until it holds." },
];

export default function DrillsPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-14 sm:px-6 sm:py-20">
      <header className="mb-14 grid gap-10 border-b border-line pb-12 lg:grid-cols-[1.1fr_1fr] lg:items-end">
        <div>
          <Eyebrow>Drills</Eyebrow>
          <h1 className="mt-3 text-[34px] leading-[1.1] font-semibold tracking-tight text-balance text-fg sm:text-[44px]">
            Pick a product. Design it until it stops breaking.
          </h1>
          <p className="mt-4 max-w-xl text-[15.5px] leading-relaxed text-pretty text-muted">
            {live.length} real products in four tracks, about {hours} hours in all. Every drill ends with your own design
            surviving a load test.
          </p>
        </div>
        <ol className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
          {loop.map((s) => (
            <li key={s.n} className="bg-surface p-4">
              <span className="font-mono text-[11px] text-accent">{s.n}</span>
              <p className="mt-1 text-[14px] font-medium text-fg">{s.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{s.text}</p>
            </li>
          ))}
        </ol>
      </header>
      <DrillIndex drills={drillCatalog} />
    </div>
  );
}
