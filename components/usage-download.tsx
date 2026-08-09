"use client";

import type { DashboardUsage } from "@/lib/dashboard/types";

export function UsageDownload({ runId, usage }: { runId: string; usage: DashboardUsage }) {
  function download() {
    const blob = new Blob([JSON.stringify(usage.raw, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${runId}_usage.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return <button className="button button-outline" onClick={download} type="button">Download usage JSON</button>;
}
