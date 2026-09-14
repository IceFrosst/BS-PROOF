# Installable PWA shell

**Date:** 2026-09-14
**Status:** implemented; production verification follows the validated `main` deploy

BS Proof now exposes an App Router web manifest and install assets so supported mobile browsers can add the HTTPS deployment to a phone as a standalone app. The installed app launches at `/scan/`; this intentionally makes the previously unlisted scanner discoverable through the public manifest while the website root remains the waitlist. Label analysis still requires a network connection and a configured model provider. No offline cache or service worker was added because caching evidence or scan responses would create a stale-data risk. Browser install criteria vary, so the Android hardware check must record whether Chrome offers **Install app** or only **Add to Home screen**.

## Icon direction

The supplied bottle-and-scanner artwork was redrawn as a mask-safe flat vector after an Opus 5 design pass. The production palette is:

- scanner frame: `#12B76A` green, with `#4ADE80` highlight
- physical bottle: white with a restrained `#DCE3EA` shade
- cap, label, and dissolve pixels: `#1A73F0` / `#5AA0FF` blue
- full-bleed background: `#0B0F14`

Green means verification, blue means data, and white keeps the product neutral. Separate `any` and `maskable` PNGs prevent Android circle and squircle masks from clipping the scanner corners. The Apple touch icon is an opaque 180 px asset without a baked-in corner radius. `public/logo-white.svg` is the requested one-color version for use on dark or green surfaces.

## Install contract

- manifest: `app/manifest.ts` → `/manifest.webmanifest`
- launch path: `/scan/`
- display mode: `standalone`
- Android assets: 192 px and 512 px, each in `any` and `maskable` variants
- iOS asset: `public/apple-touch-icon.png`, 180 px
- browser mark: `public/favicon.svg`
- browser chrome/theme: `#0B0F14`; launch background: page-matched `#F4F0E7`

## Phone test

1. Open `https://bs-proof-dashboard.vercel.app/scan/` after the validated deployment.
2. iPhone/iPad: from that `/scan/` page in Safari, use Share → **Add to Home Screen** → **Add**. Opening the install flow from the waitlist root can make older iOS versions reopen `/` instead of honoring the manifest start path.
3. Android: use Chrome → menu → **Install app**. If Chrome instead says **Add to Home screen**, record that result before calling the Android install check complete.
4. Launch **BS Proof** from the home screen. It should open `/scan/` without browser chrome and show the green-frame bottle icon.
5. From the installed app, exercise the photo picker and its `capture="environment"` camera option. The separate in-page `getUserMedia` camera is currently blocked in production by the existing `Permissions-Policy: camera=()` header; relaxing that security policy requires a separate approved change.
