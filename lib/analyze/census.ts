/*
 * How much literature EXISTS for an ingredient we have not scored, and a
 * best-effort demand queue for it. Shared by /api/analyze-label and /api/scan.
 *
 * A census is a COUNT, explicitly labelled as one: it answers "is there
 * anything to read", never "does it work". Query shape mirrors
 * sources/europepmc.py `_query` at supplement scope. Fails soft.
 *
 * The queue records demand for a product we cannot score yet. Nothing drains it
 * automatically: an upload that silently began an extraction would compete
 * with a run in progress for the same session limit (the failure that cost the
 * 2026-08-10 run 364 of 906 calls). On Vercel the filesystem is read-only
 * outside /tmp, so the queue is best-effort and says so (`durable: false`).
 */
type Json = Record<string, unknown>;

export async function census(ingredient: string, fetchFn: typeof fetch = fetch): Promise<Json> {
  const ing = ingredient.split("_").join(" ").trim();
  const supplementScoped = [
    "TITLE:supplementation",
    "ABSTRACT:supplementation",
    'TITLE:"dietary supplement"',
    'ABSTRACT:"dietary supplement"',
    'TITLE:"oral supplement"',
    'ABSTRACT:"oral supplement"',
    "TITLE:oral",
    "ABSTRACT:oral",
  ].join(" OR ");
  const exclusions =
    "eclampsia OR anesthesia OR anaesthesia OR surgery OR intravenous OR infusion " +
    "OR intubation OR ventilation OR sedation OR perioperative OR postoperative " +
    "OR preoperative OR ketamine";

  const count = async (kinds: string): Promise<number> => {
    const query =
      `("${ing}") AND (SRC:"MED") AND (${kinds}) ` +
      `AND (${supplementScoped}) NOT (${exclusions})`;
    const url =
      "https://www.ebi.ac.uk/europepmc/webservices/rest/search?" +
      new URLSearchParams({ query, format: "json", pageSize: "1" }).toString();
    const res = await fetchFn(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) throw new Error(`Europe PMC ${res.status}`);
    const page = (await res.json()) as { hitCount?: number };
    return page.hitCount ?? 0;
  };

  try {
    const [rcts, syntheses] = await Promise.all([
      count('PUB_TYPE:"Randomized Controlled Trial"'),
      count(
        'PUB_TYPE:"Meta-Analysis" OR PUB_TYPE:"Systematic Review" ' +
          'OR TITLE:"umbrella review" OR TITLE:"overview of reviews"',
      ),
    ]);
    return {
      available: true,
      rcts_indexed: rcts,
      syntheses_indexed: syntheses,
      source: "Europe PMC",
      scope: "supplement",
      is_a_score: false,
      means:
        "How many trials EXIST. Not what they found — direction and quality " +
        "require extraction, which has not been run for this product.",
    };
  } catch (err) {
    return { available: false, reason: String(err), is_a_score: false };
  }
}

export async function enqueue(ingredient: string | null, form: string | null, labelText: string | null): Promise<Json> {
  if (!ingredient && !labelText) return { queued: false, reason: "nothing identifiable to queue" };
  const { mkdir, readFile, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const key = ingredient ?? `?${labelText}`;
  const candidates = [
    path.join(process.cwd(), "out", "analysis_queue.json"),
    path.join("/tmp", "bsproof_analysis_queue.json"),
  ];
  for (const file of candidates) {
    try {
      let data: { schema_version: string; requests: Json[] } = {
        schema_version: "AnalysisQueueV1",
        requests: [],
      };
      try {
        // turbopackIgnore: a runtime queue location, not an asset to bundle.
        data = JSON.parse(await readFile(/* turbopackIgnore: true */ file, "utf8"));
      } catch {
        /* first write */
      }
      const now = new Date().toISOString().replace(/\.\d+Z$/, "Z");
      const existing = data.requests.find((r) => r.ingredient === key && r.form === form);
      if (existing) {
        existing.count = Number(existing.count ?? 1) + 1;
        existing.last_requested_at = now;
      } else {
        data.requests.push({
          ingredient: key,
          form,
          label_text: labelText,
          in_vocab: Boolean(ingredient),
          count: 1,
          first_requested_at: now,
          last_requested_at: now,
          status: "pending",
        });
      }
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, JSON.stringify(data, null, 2) + "\n", "utf8");
      return {
        queued: true,
        durable: !file.startsWith("/tmp"),
        note: "recorded for a future run; nothing runs automatically",
      };
    } catch {
      /* next candidate */
    }
  }
  return { queued: false, reason: "no writable queue location on this host" };
}
