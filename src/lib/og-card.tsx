import { ImageResponse } from "next/og";

/** Shared look for every Open Graph image: the dark theme with the orange accent. */
export const OG_SIZE = { width: 1200, height: 630 };

export const OG = {
  bg: "#121212",
  surface: "#19191b",
  border: "#353538",
  fg: "#ededec",
  muted: "#a3a3a0",
  subtle: "#6f6f6c",
  accent: "#f76b15",
  ok: "#3ccf8e",
  err: "#f0605d",
};

export const ogBackground = {
  background: OG.bg,
  backgroundImage: `radial-gradient(circle at 85% 0%, rgba(251,124,60,0.18), transparent 45%), radial-gradient(${OG.border} 1.2px, transparent 1.2px)`,
  backgroundSize: "100% 100%, 26px 26px",
};

export function OgLogo() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <svg width="44" height="44" viewBox="0 0 24 24">
        <rect x="2.5" y="2.5" width="8" height="8" rx="2" fill="none" stroke={OG.fg} strokeWidth="1.6" />
        <rect x="13.5" y="13.5" width="8" height="8" rx="2" fill={OG.accent} />
        <path d="M10.5 6.5h3.5a3 3 0 0 1 3 3v4" fill="none" stroke={OG.accent} strokeWidth="1.6" strokeLinecap="round" />
      </svg>
      <div style={{ fontSize: 34, fontWeight: 700, letterSpacing: -1 }}>Wirebox</div>
    </div>
  );
}

/** A title card for one page: eyebrow, big title, a line of summary and a footer row. */
export function ogCard({ eyebrow, title, summary, footer }: { eyebrow: string; title: string; summary: string; footer: string[] }) {
  const titleSize = title.length > 40 ? 64 : 76;
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "64px 72px",
        ...ogBackground,
        color: OG.fg,
        fontFamily: "sans-serif",
      }}
    >
      <OgLogo />
      <div style={{ display: "flex", marginTop: 52, fontSize: 26, color: OG.accent, letterSpacing: 1, textTransform: "uppercase" }}>
        {eyebrow}
      </div>
      <div style={{ display: "flex", marginTop: 14, fontSize: titleSize, fontWeight: 700, letterSpacing: -2.5, lineHeight: 1.05 }}>
        {title}
      </div>
      <div style={{ display: "flex", marginTop: 24, maxWidth: 980, fontSize: 30, lineHeight: 1.35, color: OG.muted }}>
        {summary}
      </div>
      <div style={{ display: "flex", marginTop: "auto", gap: 28, fontSize: 24, color: OG.muted }}>
        {footer.map((f, i) => (
          <div key={f} style={{ display: "flex", gap: 28 }}>
            {i > 0 && <span style={{ color: OG.subtle }}>·</span>}
            <span>{f}</span>
          </div>
        ))}
        <span style={{ marginLeft: "auto", color: OG.subtle }}>Free system design course</span>
      </div>
    </div>,
    OG_SIZE,
  );
}
