import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { metadata, viewport } from "@/app/layout";
import manifest from "@/app/manifest";

const root = process.cwd();
const rasterManifestIcons = (manifest().icons ?? [])
  .filter((icon) => icon.type === "image/png" && /^\d+x\d+$/.test(icon.sizes ?? ""))
  .map((icon) => [icon.src.replace(/^\//, ""), Number.parseInt(icon.sizes ?? "", 10)] as [string, number]);

function pngInfo(path: string): { size: [number, number]; opaque: boolean } {
  const bytes = readFileSync(path);
  expect(bytes.subarray(1, 4).toString("ascii")).toBe("PNG");
  const colorType = bytes[25];
  let offset = 8;
  let hasTransparencyChunk = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    if (type === "tRNS") hasTransparencyChunk = true;
    offset += 12 + length;
    if (type === "IEND") break;
  }
  return {
    size: [bytes.readUInt32BE(16), bytes.readUInt32BE(20)],
    opaque: colorType !== 4 && colorType !== 6 && !hasTransparencyChunk,
  };
}

describe("PWA install contract", () => {
  it("launches the scanner as a standalone app with any and maskable icons", () => {
    const value = manifest();

    expect(value).toMatchObject({
      id: "/",
      short_name: "BS Proof",
      start_url: "/scan/",
      scope: "/",
      display: "standalone",
      background_color: "#ffffff",
      theme_color: "#0B0F14",
    });
    expect(value.icons?.filter((icon) => icon.purpose === "any")).toHaveLength(2);
    expect(value.icons?.filter((icon) => icon.purpose === "maskable")).toHaveLength(2);
    for (const icon of value.icons ?? []) {
      expect(existsSync(join(root, "public", icon.src.replace(/^\//, "")))).toBe(true);
    }
  });

  it("publishes matching browser and iOS metadata", () => {
    expect(metadata.metadataBase?.toString()).toBe("https://bs-proof-dashboard.vercel.app/");
    expect(metadata.manifest).toBe("/manifest.webmanifest");
    expect(metadata.icons).toMatchObject({
      icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
      apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
    });
    expect(metadata.appleWebApp).toMatchObject({ capable: true, title: "BS Proof", statusBarStyle: "default" });
    expect(viewport).toMatchObject({ themeColor: "#0B0F14", colorScheme: "light" });
  });

  it.each([...rasterManifestIcons, ["apple-touch-icon.png", 180] as [string, number]])(
    "ships %s at the declared dimensions",
    (filename, size) => {
      const info = pngInfo(join(root, "public", filename));
      expect(info.size).toEqual([size, size]);
      expect(info.opaque).toBe(true);
    },
  );

  it("keeps the requested white logo and brand palette as vector sources", () => {
    const whiteLogo = readFileSync(join(root, "public", "logo-white.svg"), "utf8");
    const appIcon = readFileSync(join(root, "public", "pwa-icon.svg"), "utf8");

    expect(whiteLogo).toContain("#FFFFFF");
    expect(whiteLogo).not.toContain("#12B76A");
    expect(appIcon).toContain("#12B76A");
    expect(appIcon).toContain("#1A73F0");
    expect(appIcon).toContain("#0B0F14");
    expect(readFileSync(join(root, "public", "pwa-icon-maskable.svg"), "utf8")).toContain("scale(0.74)");
  });
});
