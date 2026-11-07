/*
 * Authentication of the PC worker: a dedicated shared secret,
 * BS_PROOF_RESEARCH_WORKER_TOKEN, sent as `Authorization: Bearer <token>`.
 *
 * It is NOT a Supabase token and NOT the service-role key; a signed-in user's
 * Google bearer is never accepted here and this token is never accepted on any
 * user route. Comparison is constant time: both sides are hashed to a fixed
 * 32 bytes first (so length leaks nothing) and compared with timingSafeEqual.
 * The token is never logged, echoed, stored or returned -- this module has no
 * logging at all. A token shorter than MIN_TOKEN_LENGTH counts as NOT configured
 * (fail closed: an empty or toy secret must not open the queue).
 */
import { createHash, timingSafeEqual } from "node:crypto";

export const MIN_TOKEN_LENGTH = 32;
const MAX_PRESENTED_LENGTH = 512;

export type WorkerAuth = "ok" | "denied" | "unconfigured";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function authenticateWorker(request: Request, env: Record<string, string | undefined> = process.env): WorkerAuth {
  const expected = (env.BS_PROOF_RESEARCH_WORKER_TOKEN ?? "").trim();
  if (expected.length < MIN_TOKEN_LENGTH) return "unconfigured";

  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer +(\S+)$/i.exec(header.trim());
  const presented = match && match[1].length <= MAX_PRESENTED_LENGTH ? match[1] : "";
  // Always do the comparison, so a missing header and a wrong token cost the same.
  const equal = timingSafeEqual(digest(presented), digest(expected));
  return equal && presented !== "" ? "ok" : "denied";
}
