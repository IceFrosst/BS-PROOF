/*
 * THE DASHBOARD'S FIRST RUNTIME API. Read this before adding a second one.
 *
 * Every other route in this app is statically rendered from immutable
 * `DashboardRunV1` artifacts, and the handoff in CLAUDE.md describes the
 * dashboard as having "no runtime API, uploads, pipeline controls, Supabase, or
 * public release path". That was a real constraint, not an oversight: a static
 * site has no request path to attack, no upload to abuse, and nothing that can
 * emit a number the artifacts do not contain.
 *
 * This route exists because the founder asked (2026-08-21) for label upload to
 * be the app's front door, with a vision read of the photo. It is scoped so that
 * the properties above survive as far as possible:
 *
 *   - it accepts ONE image and returns ONE JSON answer. No other verb, no
 *     listing, no mutation of any artifact, no pipeline control
 *   - it never writes to reports/. The only write is the local request queue,
 *     out/analysis_queue.json, which is gitignored and which nothing drains
 *     automatically
 *   - the score it returns is not computed here. It comes from
 *     pipeline/product_score.py, which recomputes only the DOSE term from a
 *     retained artifact's stored arcs. No formula is reimplemented in
 *     TypeScript -- one copy of the scoring model, in Python, per CLAUDE.md
 *   - the model call happens in label_adapter.py, a documented model boundary,
 *     never here. This file spawns a Python process; it holds no prompt, no
 *     schema and no model id
 *
 * It CANNOT be statically exported, so it forces a Node runtime for this path
 * only. The rest of the app still prerenders.
 *
 * WHY IT SHELLS OUT rather than calling a model directly: invariant 1 allows
 * exactly four files to reach a model, and all four are Python. Reimplementing
 * the label read in TypeScript would create a fifth boundary in a second
 * language, with its own prompt copy to drift out of sync with prompts/label.md.
 * A subprocess is the cheap way to keep one prompt and one schema.
 *
 * ============================================================================
 * THIS ROUTE DOES NOT WORK ON VERCEL, AND CANNOT BE MADE TO.
 * ============================================================================
 * It needs three things a serverless function does not have: a Python runtime
 * with this repo checked out, the `claude` CLI binary, and a signed-in Claude
 * subscription. The whole pipeline runs on subscription auth with no API key
 * anywhere (CLAUDE.md, "Extraction backends"), so there is no key to hand a
 * serverless function even in principle.
 *
 * Consequence for the deployment in the handoff: the protected Vercel PREVIEW
 * still builds and serves every static page, and the upload form still renders,
 * but a POST here returns `analyzer_unavailable`. The UI shows that as a plain
 * message rather than a broken spinner. Label upload is a LOCAL / self-hosted
 * capability (`npm run dev` beside a working `claude` CLI) until someone stands
 * up a long-running host with Python and the CLI on it -- which is a founder
 * decision about infrastructure, not something to fake here with a stub score.
 */
import { spawn } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* A label photo, not a media library. Bounded before anything touches disk. */
const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
]);
const EXT_FOR_TYPE: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

/*
 * Wall clock for the whole read. The Python side has its own 60 s ceiling on the
 * model call (label_adapter.TIMEOUT_S); this is deliberately a little longer so
 * that a model timeout surfaces as the adapter's own structured error rather
 * than as an opaque gateway kill.
 */
const TIMEOUT_MS = 90_000;

function pythonBin(): string {
  return process.env.SP_PYTHON ?? "python";
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/*
 * Is the analyzer even present? Checked before spawning so that a host without
 * Python or without the repo returns one clear sentence instead of a spawn
 * error, and so the Vercel preview (see the header) degrades legibly.
 */
async function analyzerPresent(repoRoot: string): Promise<boolean> {
  try {
    const { access } = await import("node:fs/promises");
    await access(path.join(repoRoot, "scripts", "analyze_label.py"));
    return true;
  } catch {
    return false;
  }
}

function runAnalyzer(imagePath: string, repoRoot: string): Promise<RunResult> {
  return new Promise((resolve) => {
    const child = spawn(
      // turbopackIgnore: the analyzer path is built from process.cwd() at
      // runtime, which makes the bundler trace the ENTIRE project into the
      // server output -- every source file, every artifact in reports/, the
      // public folder. That is a deployment-size and disclosure problem, and
      // tracing buys nothing here because the thing being spawned is a Python
      // script the bundler could not include anyway.
      /*turbopackIgnore: true*/ pythonBin(),
      [path.join("scripts", "analyze_label.py"), "--image", imagePath],
      {
        cwd: repoRoot,
        // PYTHONUTF8: the reports and vocab carry non-ASCII (µ, ±, en dashes)
        // and Windows defaults cp1252, which raises UnicodeEncodeError mid-print
        // and looks like a scoring failure. Measured repeatedly on this machine.
        env: { ...process.env, PYTHONUTF8: "1", PYTHONIOENCODING: "utf-8" },
      },
    );
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, TIMEOUT_MS);

    child.stdout.on("data", (d) => {
      stdout += String(d);
    });
    child.stderr.on("data", (d) => {
      stderr += String(d);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, stdout, stderr: String(err), timedOut });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, timedOut });
    });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json(
      { status: "bad_request", error: "Expected a multipart form upload." },
      { status: 400 },
    );
  }

  const file = form.get("image");
  if (!(file instanceof File)) {
    return NextResponse.json(
      { status: "bad_request", error: "No image field in the upload." },
      { status: 400 },
    );
  }
  if (file.size === 0) {
    return NextResponse.json(
      { status: "bad_request", error: "That image is empty." },
      { status: 400 },
    );
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      {
        status: "bad_request",
        error: `That image is ${(file.size / 1e6).toFixed(1)} MB. The limit is ${(
          MAX_BYTES / 1e6
        ).toFixed(0)} MB.`,
      },
      { status: 413 },
    );
  }
  if (!ALLOWED_TYPES.has(file.type)) {
    return NextResponse.json(
      {
        status: "bad_request",
        error: `Unsupported image type ${file.type || "(none)"}. Use PNG, JPEG, WebP or GIF.`,
      },
      { status: 415 },
    );
  }

  const repoRoot = process.cwd();
  if (!(await analyzerPresent(repoRoot))) {
    return NextResponse.json(
      {
        status: "analyzer_unavailable",
        error:
          "Label reading is not available on this host. It needs Python, this repository, and a signed-in Claude CLI — so it runs locally, not on a serverless preview.",
      },
      { status: 503 },
    );
  }

  // A fresh directory per request, and the analyzer's --add-dir is scoped to it,
  // so one upload can never read another's file. Named from the OS temp dir
  // rather than anywhere under the repo: nothing uploaded belongs in the tree.
  const dir = await mkdtemp(path.join(tmpdir(), "bsproof-label-"));
  const imagePath = path.join(dir, `label${EXT_FOR_TYPE[file.type] ?? ".png"}`);

  try {
    await writeFile(imagePath, Buffer.from(await file.arrayBuffer()));
    const result = await runAnalyzer(imagePath, repoRoot);

    if (result.timedOut) {
      return NextResponse.json(
        {
          status: "timeout",
          error:
            "The label read took too long. Try a tighter crop of the Supplement Facts panel.",
        },
        { status: 504 },
      );
    }

    // The analyzer prints one JSON object on stdout and exits non-zero for any
    // status other than `scored` -- including the legitimate ones such as
    // `not_scored`. So a non-zero exit is NOT an error here: parse first, and
    // only treat it as a failure when there is no parseable answer.
    let parsed: unknown = null;
    const start = result.stdout.indexOf("{");
    const end = result.stdout.lastIndexOf("}");
    if (start !== -1 && end > start) {
      try {
        parsed = JSON.parse(result.stdout.slice(start, end + 1));
      } catch {
        parsed = null;
      }
    }

    if (parsed === null) {
      return NextResponse.json(
        {
          status: "analyzer_failed",
          error: "The analyzer did not return a result.",
          // Truncated, and stderr only: stdout could carry label text, and an
          // error page is not a place to echo a user's upload back at them.
          detail: result.stderr.slice(-600) || null,
          exit_code: result.code,
        },
        { status: 500 },
      );
    }

    return NextResponse.json(parsed, {
      status: 200,
      // Every answer is specific to one uploaded photo. Nothing here is
      // cacheable, and a shared cache holding somebody's product read would be
      // a privacy bug rather than a performance win.
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return NextResponse.json(
      { status: "analyzer_failed", error: String(err) },
      { status: 500 },
    );
  } finally {
    // The upload does not outlive the request.
    await rm(dir, { recursive: true, force: true }).catch(() => undefined);
  }
}
