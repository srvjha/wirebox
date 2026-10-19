import type { ReactNode } from "react";
import {
  ArrowUpRight,
  Bell,
  Car,
  Clock,
  CreditCard,
  Database,
  FileText,
  FolderSync,
  Image as ImageIcon,
  Link2,
  MessageCircle,
  PenLine,
  Radio,
  Search,
  Ticket,
  TrendingUp,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { Difficulty, DrillMeta } from "@/content/drills/catalog";
import { cn } from "@/lib/utils";
import { TrackedLink } from "./tracked-link";

const drillIcons: Record<string, LucideIcon> = {
  "url-shortener": Link2,
  pastebin: FileText,
  notifications: Bell,
  "video-platform": Video,
  chat: MessageCircle,
  "news-feed": ImageIcon,
  "ticket-booking": Ticket,
  payments: CreditCard,
  "ride-dispatch": Car,
  "collab-editor": PenLine,
  "file-sync": FolderSync,
  "ranked-feed": TrendingUp,
  presence: Radio,
  "search-autocomplete": Search,
  "key-value-store": Database,
};

export const difficultyTone: Record<Difficulty, "ok" | "warn" | "err"> = {
  easy: "ok",
  medium: "warn",
  hard: "err",
};

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
  return <Badge tone={difficultyTone[difficulty]}>{difficulty}</Badge>;
}

export function DrillIcon({ slug, className }: { slug: string; className?: string }) {
  const Icon = drillIcons[slug] ?? Database;
  return <Icon className={className} aria-hidden />;
}

/**
 * One drill in a grid. Live drills are a single big link; planned ones render as
 * a quieter, non-interactive card.
 */
export function DrillCard({
  drill,
  location,
  progress,
  maxConcepts = 4,
  className,
}: {
  drill: DrillMeta;
  location: string;
  progress?: ReactNode;
  maxConcepts?: number;
  className?: string;
}) {
  const live = drill.status === "live";
  const shown = drill.concepts.slice(0, maxConcepts);
  const more = drill.concepts.length - shown.length;

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div
          className={cn(
            "grid size-10 shrink-0 place-items-center rounded-xl border",
            live ? "border-accent/30 bg-accent-soft text-accent" : "border-line bg-surface-2 text-muted",
          )}
        >
          <DrillIcon slug={drill.slug} className="size-[18px]" />
        </div>
        {live ? (
          <Badge tone="accent">
            <span className="size-1.5 rounded-full bg-accent" /> Live
          </Badge>
        ) : (
          <Badge>Coming soon</Badge>
        )}
      </div>
      <p className="mt-4 font-mono text-[10.5px] tracking-[0.08em] text-subtle uppercase">{drill.product}</p>
      <h3 className="mt-1 text-[16px] font-semibold tracking-tight text-fg">{drill.title}</h3>
      <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{drill.tagline}</p>
      <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Concepts">
        {shown.map((c) => (
          <li key={c} className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 text-[11.5px] text-muted">
            {c}
          </li>
        ))}
        {more > 0 && <li className="px-1 py-0.5 text-[11.5px] text-subtle">+{more} more</li>}
      </ul>
      <div className="mt-auto pt-5">
        {progress}
        <div className="flex items-center gap-3 text-[12.5px] text-subtle">
          <DifficultyBadge difficulty={drill.difficulty} />
          <span className="inline-flex items-center gap-1">
            <Clock className="size-3.5" aria-hidden /> {drill.minutes} min
          </span>
          {live && (
            <span className="ml-auto inline-flex items-center gap-1 font-medium text-fg transition-colors group-hover:text-accent">
              Open drill <ArrowUpRight className="size-3.5" aria-hidden />
            </span>
          )}
        </div>
      </div>
    </>
  );

  const base = "group flex h-full flex-col rounded-2xl border p-5 transition-colors";
  if (!live) {
    return <div className={cn(base, "border-line bg-surface/60", className)}>{body}</div>;
  }
  return (
    <TrackedLink
      plain
      href={`/drills/${drill.slug}`}
      location={location}
      className={cn(
        base,
        "border-line bg-surface shadow-card outline-none hover:border-accent/50 focus-visible:ring-2 focus-visible:ring-accent/60",
        className,
      )}
    >
      {body}
    </TrackedLink>
  );
}
