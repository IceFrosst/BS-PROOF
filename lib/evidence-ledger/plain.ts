import type { AuditOutcome, PlainEntry, PlainFile } from "./index";

export function auditPlainEntry(plain: PlainFile, outcome: AuditOutcome): PlainEntry | null {
  return plain[`${outcome.name}||${outcome.population ?? ""}`] ?? null;
}
export function auditPlainText(entry: PlainEntry | null, group: "effect" | "evidence" | "form" | "dose" | "summary", field: string, original: string): string {
  const value = (entry as Record<string, Record<string, string> | undefined> | null)?.[group]?.[field];
  return typeof value === "string" && value.trim() ? value : original;
}
