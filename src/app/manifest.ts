import type { MetadataRoute } from "next";

/**
 * Web App Manifest for installable Noka PWA (RFC-009, F18, STACK-5, OFFLINE-1).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Noka",
    short_name: "Noka",
    description:
      "Seringan Notepad, Serapi Buku Kas. Catatan Markdown, checklist GFM, dan pelacakan kas multi-dompet IDR.",
    start_url: "/app/notes",
    scope: "/",
    display: "standalone",
    background_color: "#ededed",
    theme_color: "#222222",
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}

