/*
 * DURABLE SCAN-RUN HISTORY. Every accepted `POST /api/scan` run (photo or
 * manual) is written here so the owner can inspect it later: the complete
 * `ScanAnalysis` JSON the caller received, the request facts that produced it,
 * the terminal status/error, and the exact app release that ran it. A photo
 * run's original image goes to a PRIVATE Supabase Storage bucket, never base64
 * in the database -- only its bucket, path, MIME type, byte size and SHA-256.
 *
 * SAME SHAPE AS lib/waitlist/store.ts, on purpose: server-only
 * `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (no `NEXT_PUBLIC_` prefix, so
 * Next.js never inlines it into a client bundle), plain `fetch` against
 * Supabase's PostgREST and Storage REST APIs, no `@supabase/supabase-js`. This
 * module is imported only by `app/api/scan/route.ts`.
 *
 * HONEST BY CONSTRUCTION. `recordScanRun` never claims a run or an image is
 * "stored" unless the write actually succeeded: unconfigured is `unavailable`,
 * a failed write is `failed`, and the two are reported SEPARATELY (a run row
 * can be stored while its image failed, or vice versa is impossible -- the row
 * always carries whatever the image outcome was). Local and test builds work
 * with no credentials at all (`unavailable`, not a crash); a deployment can opt
 * into fail-closed behaviour with `SCAN_HISTORY_REQUIRED=1`, in which case
 * `app/api/scan/route.ts` refuses to serve a scan whose run could not be
 * durably recorded, rather than answering with an unrecorded result.
 *
 * There is no public read path here and no signed URL is ever minted for a
 * stored image -- reading this history back is a job for someone holding the
 * service role key directly (the SQL Editor, or a future owner-only tool), not
 * this app. See docs/scan-history.sql for the table, the bucket and the RLS
 * posture (enabled, no anon policies -- identical discipline to
 * docs/waitlist.sql).
 */
import { createHash, randomUUID } from "node:crypto";

import pkg from "@/package.json";

const TABLE = "scan_runs";
export const SCAN_IMAGES_BUCKET = "scan-images";

export type ScanHistorySource = "photo" | "manual";

/** Exact app release identity. Every field is null, honestly, when unknown. */
export interface AppVersionInfo {
  /** package.json version at build time. */
  package_version: string;
  /** VERCEL_GIT_COMMIT_SHA -- the exact commit this deployment built from. */
  git_sha: string | null;
  git_ref: string | null;
  /** VERCEL_DEPLOYMENT_ID, when Vercel sets it for this runtime. */
  deployment_id: string | null;
  /** "production" | "preview" | "development", per Vercel's own values. */
  vercel_env: string | null;
  /** VERCEL_URL -- the deployment's own hostname, no scheme. */
  url: string | null;
}

function nonEmpty(raw: string | undefined): string | null {
  const s = (raw ?? "").trim();
  return s ? s : null;
}

/** Reads Vercel's build-time env; off Vercel every field beyond the package
 * version is honestly null rather than guessed. */
export function appVersionInfo(): AppVersionInfo {
  return {
    package_version: pkg.version,
    git_sha: nonEmpty(process.env.VERCEL_GIT_COMMIT_SHA),
    git_ref: nonEmpty(process.env.VERCEL_GIT_COMMIT_REF),
    deployment_id: nonEmpty(process.env.VERCEL_DEPLOYMENT_ID),
    vercel_env: nonEmpty(process.env.VERCEL_ENV),
    url: nonEmpty(process.env.VERCEL_URL),
  };
}

export function newRunId(): string {
  return randomUUID();
}

interface Config {
  url: string;
  key: string;
}

function config(): Config | null {
  const url = (process.env.SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) return null;
  return { url, key };
}

/** Configured, or not. Mirrors `waitlistConfigured` -- returning false (not
 * throwing) is what lets a local or CI build run with no database at all. */
export function scanHistoryConfigured(): boolean {
  return config() !== null;
}

/** Fail-closed switch (founder-controlled, per deployment). Off by default so
 * local/test builds and a deployment with no Supabase project stay usable. */
export function scanHistoryRequired(): boolean {
  return process.env.SCAN_HISTORY_REQUIRED === "1";
}

export type ScanPersistStatus = "stored" | "unavailable" | "failed";

export interface ScanImageRecord {
  status: ScanPersistStatus | "not_applicable";
  bucket: string | null;
  path: string | null;
  mime_type: string | null;
  bytes: number | null;
  sha256: string | null;
  detail?: string;
}

export interface ScanHistoryOutcome {
  /** Whether the RUN ROW was durably written. Independent of `image.status`. */
  status: ScanPersistStatus;
  run_id: string;
  detail?: string;
  image: ScanImageRecord;
}

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

function sha256Hex(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Uploads the original photo to the private bucket. Never throws. */
async function uploadImage(
  cfg: Config,
  runId: string,
  bytes: Buffer,
  mimeType: string,
  fetchFn: typeof fetch,
): Promise<ScanImageRecord> {
  const sha256 = sha256Hex(bytes);
  const ext = EXT_BY_MIME[mimeType] ?? "bin";
  const path = `${runId}/original.${ext}`;
  const base: Omit<ScanImageRecord, "status" | "detail"> = {
    bucket: SCAN_IMAGES_BUCKET,
    path: null,
    mime_type: mimeType,
    bytes: bytes.length,
    sha256,
  };
  try {
    const res = await fetchFn(
      `${cfg.url}/storage/v1/object/${SCAN_IMAGES_BUCKET}/${path}`,
      {
        method: "POST",
        headers: {
          apikey: cfg.key,
          Authorization: `Bearer ${cfg.key}`,
          "Content-Type": mimeType,
          // Each run id is fresh (crypto.randomUUID), so a collision would be
          // a re-processed request, not a different image -- upsert rather
          // than fail on it.
          "x-upsert": "true",
        },
        // Buffer is a Uint8Array; the DOM fetch types in this project's lib
        // do not know that, so the shape is asserted rather than converted
        // (a conversion would double the allocation for every upload).
        body: bytes as unknown as BodyInit,
        signal: AbortSignal.timeout(15_000),
      },
    );
    if (!res.ok) {
      let body = "";
      try {
        body = (await res.text()).slice(0, 300);
      } catch {
        /* status line is enough */
      }
      return { ...base, status: "failed", detail: `storage upload returned ${res.status}: ${body}` };
    }
    return { ...base, status: "stored", path };
  } catch (err) {
    return { ...base, status: "failed", detail: `could not reach storage: ${String(err)}` };
  }
}

/** Best-effort delete of an orphaned image (DB insert failed after upload
 * succeeded). Never throws -- there is nothing more useful to do than log. */
async function deleteImage(cfg: Config, path: string, fetchFn: typeof fetch): Promise<void> {
  try {
    await fetchFn(`${cfg.url}/storage/v1/object/${SCAN_IMAGES_BUCKET}/${path}`, {
      method: "DELETE",
      headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` },
      signal: AbortSignal.timeout(8_000),
    });
  } catch {
    // Best effort. A stranded private-bucket object costs storage, not a leak
    // -- it is never publicly readable and never blocks the next run.
  }
}

interface InsertResult {
  ok: boolean;
  detail?: string;
}

async function insertRun(cfg: Config, row: Record<string, unknown>, fetchFn: typeof fetch): Promise<InsertResult> {
  try {
    const res = await fetchFn(`${cfg.url}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify([row]),
      signal: AbortSignal.timeout(10_000),
    });
    if (res.ok) return { ok: true };
    let body = "";
    try {
      body = (await res.text()).slice(0, 400);
    } catch {
      /* status line is enough */
    }
    return { ok: false, detail: `scan history store returned ${res.status}: ${body}` };
  } catch (err) {
    return { ok: false, detail: `could not reach the scan history store: ${String(err)}` };
  }
}

export interface RecordScanRunInput {
  runId: string;
  source: ScanHistorySource;
  /** Terminal `ScanAnalysis.status` (or a route-level failure code). */
  status: string;
  error: string | null;
  /** Request facts/metadata -- never image bytes or base64. */
  request: Record<string, unknown>;
  /** The COMPLETE ScanAnalysis JSON the caller received (JSON-serialisable). */
  analysis: unknown;
  /** Present on the photo path only. */
  image?: { bytes: Buffer; mimeType: string } | null;
}

/**
 * Persist one accepted scan run. Never throws -- every failure mode (no
 * config, network error, non-2xx) becomes a reported outcome, because a
 * throwing history writer would turn an analysis the caller already has into
 * a 500 for an unrelated reason.
 */
export async function recordScanRun(
  input: RecordScanRunInput,
  fetchFn: typeof fetch = fetch,
): Promise<ScanHistoryOutcome> {
  const notApplicable: ScanImageRecord = {
    status: "not_applicable",
    bucket: null,
    path: null,
    mime_type: null,
    bytes: null,
    sha256: null,
  };

  const cfg = config();
  if (!cfg) {
    return {
      status: "unavailable",
      run_id: input.runId,
      detail: "scan history is not configured on this deployment: set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY",
      image: input.image
        ? { ...notApplicable, status: "unavailable", mime_type: input.image.mimeType, bytes: input.image.bytes.length, sha256: sha256Hex(input.image.bytes) }
        : notApplicable,
    };
  }

  const image: ScanImageRecord = input.image
    ? await uploadImage(cfg, input.runId, input.image.bytes, input.image.mimeType, fetchFn)
    : notApplicable;

  const row = {
    id: input.runId,
    source: input.source,
    status: input.status,
    error: input.error,
    request: input.request,
    analysis: input.analysis,
    app_version: appVersionInfo(),
    image_bucket: image.bucket,
    image_path: image.path,
    image_mime_type: image.mime_type,
    image_bytes: image.bytes,
    image_sha256: image.sha256,
    image_status: image.status,
  };

  const insert = await insertRun(cfg, row, fetchFn);
  if (!insert.ok) {
    // The image is now an orphan: nothing references it and it will never be
    // findable through this app. Best-effort clean it up rather than leave a
    // private-bucket object with no database row.
    if (image.status === "stored" && image.path) {
      await deleteImage(cfg, image.path, fetchFn);
    }
    return { status: "failed", run_id: input.runId, detail: insert.detail, image };
  }

  return { status: "stored", run_id: input.runId, image };
}

/**
 * Whether an outcome meets the fail-closed bar for its source: the run row
 * must be stored, and a photo run's image must also be stored (a photo run
 * whose image silently vanished is not the durable record this exists for).
 */
export function scanHistorySatisfies(outcome: ScanHistoryOutcome, source: ScanHistorySource): boolean {
  if (outcome.status !== "stored") return false;
  if (source === "photo" && outcome.image.status !== "stored") return false;
  return true;
}
