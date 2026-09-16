# Video design research — resume note (paused 2026-09-09 evening)

Goal: read transcripts (+ selected keyframes) of 10 mobile-design YouTube videos, analyse with Claude Fable 5.1 (`anthropic/claude-fable-5-1`), apply learnings, then present 3 alternative app concepts with flows. Fable reads text only; keyframes need a vision-capable model. Never claim video was "watched".

Candidate videos (found via live web search; relevance unverified until transcripts are read):
- Qsq-Sj_rojU Mobbin — 1,460 onboarding flows
- dGcqqA3Sl-o Apple WWDC25 — Design foundations from idea to interface
- pD43DI-VA20 Apple WWDC25 — Principles of inclusive app design
- DS2ildqCrB0 Apple WWDC25 — Get to know the new design system  (TRANSCRIPT OBTAINED: /tmp/yt/DS2ildqCrB0.en-zh-Hans.vtt — English track; may not survive reboot)
- cJh0yZzlPlk Monterail — AI-enhanced UX in HealthTech
- 14h1VnkQvIc Kole Jain — mobile swipe interactions
- Gfsd8NNuD9g Kole Jain — design a mobile app UI from scratch
- 76u-t6drWFY Intellipaat — UI/UX full course (long; sample only)
- zzbI2nx4IDM Silktide — gamifying digital accessibility
- arFo47llalE Amy — launching a health app in 6 weeks

Blocker: YouTube HTTP 429 rate limit on this machine for caption endpoints (transcript skill, yt-dlp, browser fetch and transcript panel). Retry after a break; slow requests (sleep 15s+). yt-dlp installed via pip --user at ~/.local/bin.

Then: build 3 alternative app concepts/flows as local prototypes on branch launch/ai-wrapper-planning (existing: /design-lab and /design-lab/mobile). Simulated data only, production route 404.
