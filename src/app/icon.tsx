import { ImageResponse } from "next/og";

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

/** The Wirebox mark (outlined box wired to a solid orange box) on a dark tile. */
export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "#0b0b0c",
        borderRadius: 14,
      }}
    >
      <svg width="50" height="50" viewBox="0 0 24 24">
        <rect x="2.5" y="2.5" width="8" height="8" rx="2" fill="none" stroke="#ededec" strokeWidth="2" />
        <rect x="13.5" y="13.5" width="8" height="8" rx="2" fill="#fb7c3c" />
        <path d="M10.5 6.5h3.5a3 3 0 0 1 3 3v4" fill="none" stroke="#fb7c3c" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>,
    size,
  );
}
