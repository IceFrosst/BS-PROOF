import type { MetadataRoute } from "next";

/** Installable shell for the phone-first scanner. Live analysis still requires a connection. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "BS Proof · Supplement Scanner",
    short_name: "BS Proof",
    description: "Scan a supplement label and inspect the evidence, dose, form, compatibility, and company context.",
    start_url: "/scan/",
    scope: "/",
    display: "standalone",
    background_color: "#F4F0E7",
    theme_color: "#0B0F14",
    categories: ["health", "utilities"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
