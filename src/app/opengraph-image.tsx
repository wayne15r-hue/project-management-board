import { ImageResponse } from "next/og";
import { BRAND } from "@/lib/brand";

export const alt =
  "Helios: Bring your team’s work into focus. Projects, people and daily operations.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function SocialImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "65px 80px",
        background: "#080D19",
        color: "#F4F1E8",
        position: "relative",
      }}
    >
      <div
        style={{
          position: "absolute",
          width: 540,
          height: 540,
          borderRadius: "50%",
          border: "1px solid #695033",
          right: -100,
          top: 60,
          display: "flex",
        }}
      />
      <div
        style={{ display: "flex", alignItems: "center", gap: 18, fontSize: 34 }}
      >
        <svg width="52" height="52" viewBox="0 0 40 40">
          <circle
            cx="20"
            cy="20"
            r="16"
            fill="none"
            stroke="#FFB547"
            strokeWidth="1"
          />
          <path
            d="M13 10v20m14-20v20M13 20h14"
            stroke="#FFB547"
            strokeWidth="4"
          />
          <circle cx="20" cy="20" r="4" fill="#FFB547" />
        </svg>
        {BRAND.name}
      </div>
      <div style={{ display: "flex", flexDirection: "column", maxWidth: 900 }}>
        <div style={{ fontSize: 76, letterSpacing: -4, lineHeight: 1.08 }}>
          Bring your team’s work into focus.
        </div>
        <div style={{ fontSize: 24, color: "#AAB4C5", marginTop: 26 }}>
          Projects. People. Daily operations.
        </div>
      </div>
      <div style={{ display: "flex", color: "#FFB547", fontSize: 20 }}>
        A shared direction for the work ahead.
      </div>
    </div>,
    size,
  );
}
