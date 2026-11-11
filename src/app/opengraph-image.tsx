import { ImageResponse } from "next/og";

export const alt = "Noka — Seringan Notepad, Serapi Buku Kas";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";
export const dynamic = "force-dynamic";

/**
 * Generates high-contrast 1200x630 PNG Open Graph card without external font requests.
 */
export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "64px",
          backgroundColor: "#0f172a",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "14px",
              fontSize: "28px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
            }}
          >
            <div
              style={{
                width: "20px",
                height: "20px",
                borderRadius: "6px",
                backgroundColor: "#4ade80",
                display: "flex",
              }}
            />
            <span>Noka — Note + Kas</span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "8px 16px",
              borderRadius: "9999px",
              border: "1px solid #475569",
              color: "#cbd5e1",
              fontSize: "20px",
            }}
          >
            IDR • Offline-First • Bilingual
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "20px",
            maxWidth: "960px",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: "64px",
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.03em",
              color: "#ffffff",
            }}
          >
            Seringan Notepad, Serapi Buku Kas.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "28px",
              lineHeight: 1.4,
              color: "#cbd5e1",
            }}
          >
            Markdown Notes • Smart Quick Capture • Safe-to-Spend • Privacy Blur
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: "16px",
          }}
        >
          {["Light / Dark Mode", "ID / EN Instan", "100% Privat"].map(
            (label) => (
              <div
                key={label}
                style={{
                  display: "flex",
                  padding: "10px 20px",
                  borderRadius: "10px",
                  backgroundColor: "#1e293b",
                  border: "1px solid #334155",
                  color: "#f8fafc",
                  fontSize: "22px",
                  fontWeight: 600,
                }}
              >
                {label}
              </div>
            ),
          )}
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}

