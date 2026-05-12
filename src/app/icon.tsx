import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: "#7c3aed",
        borderRadius: "100%",
      }}
    >
      <svg width="18" height="18" viewBox="0 0 14 14" fill="none">
        <circle cx="7" cy="7" r="2.5" fill="white" />
        <path
          d="M7 2v1.5M7 10.5V12M2 7h1.5M10.5 7H12"
          stroke="white"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </div>,
    { ...size },
  );
}
