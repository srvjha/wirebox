import { ImageResponse } from "next/og";
import { courseStats } from "@/content/course";
import { drillCatalog } from "@/content/drills/catalog";
import { OG as C, OG_SIZE, OgLogo, ogBackground } from "@/lib/og-card";

export const alt = "Wirebox: learn system design by building it. Free for everyone.";
export const size = OG_SIZE;
export const contentType = "image/png";


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
        ...ogBackground,
        color: C.fg,
        fontFamily: "sans-serif",
      }}
    >
      <OgLogo />

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
