import { ImageResponse } from "next/og";
import { courseStats } from "@/content/course";
import { drillCatalog } from "@/content/drills/catalog";

export const alt = "Wirebox: learn system design by building it. Free for everyone.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const C = {
  bg: "#121212",
  surface: "#19191b",
  border: "#353538",
  fg: "#ededec",
  muted: "#a3a3a0",
  subtle: "#6f6f6c",
  accent: "#3ecf8e",
  ok: "#3ccf8e",
  err: "#f0605d",
};

function Node({ label, tone }: { label: string; tone?: string }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        width: 150,
        height: 56,
        borderRadius: 12,
        background: C.surface,
        border: `2px solid ${tone ?? C.border}`,
        color: C.fg,
        fontSize: 22,
        fontWeight: 600,
      }}
    >
      {label}
    </div>
  );
}

function Link({ color = C.border }: { color?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", width: 44 }}>
      <div style={{ flex: 1, height: 2, background: color }} />
      <div style={{ width: 9, height: 9, borderRadius: 9, background: color }} />
    </div>
  );
}

export default function OpengraphImage() {
  const hours = Math.round(courseStats.minutes / 60);
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "64px 72px",
        background: C.bg,
        backgroundImage: `radial-gradient(circle at 85% 0%, rgba(251,124,60,0.18), transparent 45%), radial-gradient(${C.border} 1.2px, transparent 1.2px)`,
        backgroundSize: "100% 100%, 26px 26px",
        color: C.fg,
        fontFamily: "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <svg width="44" height="44" viewBox="0 0 24 24">
          <rect x="2.5" y="2.5" width="8" height="8" rx="2" fill="none" stroke={C.fg} strokeWidth="1.6" />
          <rect x="13.5" y="13.5" width="8" height="8" rx="2" fill={C.accent} />
          <path
            d="M10.5 6.5h3.5a3 3 0 0 1 3 3v4"
            fill="none"
            stroke={C.accent}
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
        <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>Wirebox</div>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: 56 }}>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02 }}>Learn system design</div>
        <div style={{ fontSize: 76, fontWeight: 700, letterSpacing: -3, lineHeight: 1.02, color: C.accent }}>
          by building it.
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", marginTop: 52 }}>
        <Node label="Fans" />
        <Link color={C.accent} />
        <Node label="Limiter" />
        <Link color={C.accent} />
        <Node label="LB" />
        <Link color={C.accent} />
        <Node label="API" tone={C.err} />
        <Link color={C.ok} />
        <Node label="Postgres" />
      </div>

      <div style={{ display: "flex", marginTop: "auto", gap: 28, fontSize: 24, color: C.muted }}>
        <span>{courseStats.modules} modules</span>
        <span style={{ color: C.subtle }}>·</span>
        <span>{courseStats.lessons} lessons</span>
        <span style={{ color: C.subtle }}>·</span>
        <span>{drillCatalog.length} product drills</span>
        <span style={{ color: C.subtle }}>·</span>
        <span>{hours} hours</span>
        <span style={{ marginLeft: "auto", color: C.subtle }}>No paywall. No trial.</span>
      </div>
    </div>,
    size,
  );
}
