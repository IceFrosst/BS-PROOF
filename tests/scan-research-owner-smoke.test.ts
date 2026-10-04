// @vitest-environment node
/*
 * The private owner-smoke gate for live research (lib/scan-research/contract.ts
 * `liveResearchMode` / `researchOwnerIds`; docs/research/pc-research-worker.md
 * "Staged rollout").
 *
 * Why it exists: SCAN_LIVE_RESEARCH_ENABLED=on opens the queue to EVERY signed-in
 * Google user, and the scan panel asks for research on every stored scan. Before
 * one real job has been proven end to end the queue must be open to the one
 * genuine Google owner running the smoke and to nobody else, WITHOUT forging a
 * test identity, so the gate is keyed on the Supabase-verified user id.
 *
 * Pinned: the mode parse is fail-closed (only the exact words), `owners` with an
 * empty / malformed / missing list admits nobody, a non-listed verified user gets
 * the SAME 503 research_disabled body as OFF (so the list is not probed), the list
 * check runs after authentication and before the body / scan read / queue call,
 * the id comes only from Supabase's own answer (an email, a client-supplied id
 * and a user_metadata value never match), listed users still get the full
 * existing behaviour (ownership 404s, idempotence, owner-only GET), and the
 * worker door and the owner-only job GET are untouched by the mode.
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- route replies are read as untyped JSON on purpose */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST as enqueue } from "@/app/api/scan/research/route";
import { GET as status } from "@/app/api/scan/research/[id]/route";
import { POST as worker } from "@/app/api/scan/research/worker/route";
import {
  MAX_RESEARCH_OWNER_IDS,
  liveResearchEnabled,
  liveResearchMode,
  researchOwnerIds,
} from "@/lib/scan-research/contract";
import { FakeResearchQueue } from "./helpers/fake-research-queue";
import { FAKE_KEY, FAKE_URL, FakeSupabase, USER_A, USER_B, USER_C, emailUser, googleUser } from "./helpers/fake-supabase";

const ENV_KEYS = [
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SCAN_REQUIRE_AUTH",
  "SCAN_LIVE_RESEARCH_ENABLED",
  "SCAN_LIVE_RESEARCH_OWNER_IDS",
  "BS_PROOF_RESEARCH_WORKER_TOKEN",
] as const;
const saved = { ...process.env };
const originalFetch = global.fetch;
const WORKER_TOKEN = "w".repeat(48);

const SCAN_A = "aaaaaaaa-aaaa-4aaa-8aaa-000000000001";
const SCAN_B = "bbbbbbbb-bbbb-4bbb-8bbb-000000000001";

let fake: FakeSupabase;
let queue: FakeResearchQueue;

const analysis = () => ({
  schema_version: "ScanAnalysisV1",
  status: "scored",
  source: "manual",
  input: {
    basis: "user_input",
    ingredient: "creatine",
    ingredient_label: "Creatine",
    form: "creatine_monohydrate",
    form_label: "Creatine monohydrate",
    dose_per_serving: { value: 4000, unit: "mg", mg: 4000 },
    servings_per_day: null,
  },
  product: {
    ingredient: "creatine",
    form: "creatine_monohydrate",
    compound_dose_mg: 4000,
    elemental_dose_mg: null,
    servings_per_day: null,
    scored_dose_mg: null,
    scored_dose_basis: null,
    is_multi_ingredient: false,
    other_actives: [],
  },
});

beforeEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
  process.env.SUPABASE_URL = FAKE_URL;
  process.env.SUPABASE_SERVICE_ROLE_KEY = FAKE_KEY;
  process.env.BS_PROOF_RESEARCH_WORKER_TOKEN = WORKER_TOKEN;
  fake = new FakeSupabase();
  fake.addUser("tok-a", googleUser(USER_A, "alice@example.com"));
  fake.addUser("tok-b", googleUser(USER_B, "bob@example.com"));
  fake.addUser("tok-mail", emailUser(USER_C, "carol@example.com"));
  fake.addRun({ id: SCAN_A, user_id: USER_A, user_email: "alice@example.com", analysis: analysis() });
  fake.addRun({ id: SCAN_B, user_id: USER_B, user_email: "bob@example.com", analysis: analysis() });
  queue = new FakeResearchQueue(fake);
  global.fetch = queue.fetch;
});
afterEach(() => {
  global.fetch = originalFetch;
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
const post = (body: unknown, headers: Record<string, string> = {}) =>
  enqueue(new Request("http://localhost/api/scan/research/", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));
const get = (id: string, headers: Record<string, string> = {}) =>
  status(new Request(`http://localhost/api/scan/research/${id}/`, { headers }), { params: Promise.resolve({ id }) });
const work = (body: unknown) =>
  worker(
    new Request("http://localhost/api/scan/research/worker/", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${WORKER_TOKEN}` },
      body: JSON.stringify(body),
    }),
  );
const json = async (res: Response) => (await res.json()) as Record<string, any>;

describe("liveResearchMode: fail-closed parse", () => {
  it("is off for unset, empty, off words, typos and near-misses of 'owners'", () => {
    expect(liveResearchMode({})).toBe("off");
    for (const v of ["", "0", "false", "off", "no", "enabled", "tru", " 2 ", "owner", "owners,everyone", "private", "smoke", "ownerss"]) {
      expect(liveResearchMode({ SCAN_LIVE_RESEARCH_ENABLED: v }), JSON.stringify(v)).toBe("off");
    }
  });

  it("'everyone' only for the existing on-words; 'owners' only for exactly that word (case/space tolerant)", () => {
    for (const v of ["1", "true", "ON", " yes "]) expect(liveResearchMode({ SCAN_LIVE_RESEARCH_ENABLED: v }), v).toBe("everyone");
    for (const v of ["owners", " OWNERS ", "Owners"]) expect(liveResearchMode({ SCAN_LIVE_RESEARCH_ENABLED: v }), v).toBe("owners");
  });

  it("liveResearchEnabled keeps its old meaning: true only when open to everyone", () => {
    expect(liveResearchEnabled({ SCAN_LIVE_RESEARCH_ENABLED: "owners" })).toBe(false);
    expect(liveResearchEnabled({ SCAN_LIVE_RESEARCH_ENABLED: "1" })).toBe(true);
    expect(liveResearchEnabled({})).toBe(false);
  });

  it("the owner list does not change the mode: a list with the flag unset or off is still off", () => {
    expect(liveResearchMode({ SCAN_LIVE_RESEARCH_OWNER_IDS: USER_A })).toBe("off");
    expect(liveResearchMode({ SCAN_LIVE_RESEARCH_ENABLED: "0", SCAN_LIVE_RESEARCH_OWNER_IDS: USER_A })).toBe("off");
  });
});

describe("researchOwnerIds: only well-formed user ids", () => {
  it("is empty when unset, blank or all junk", () => {
    expect(researchOwnerIds({}).size).toBe(0);
    expect(researchOwnerIds({ SCAN_LIVE_RESEARCH_OWNER_IDS: "   " }).size).toBe(0);
    expect(researchOwnerIds({ SCAN_LIVE_RESEARCH_OWNER_IDS: "alice@example.com, *, not-a-uuid, 1111" }).size).toBe(0);
  });

  it("splits on comma / semicolon / whitespace, lower-cases, drops junk, dedupes", () => {
    const ids = researchOwnerIds({ SCAN_LIVE_RESEARCH_OWNER_IDS: ` ${USER_A.toUpperCase()},junk;${USER_B}\n${USER_A} ` });
    expect([...ids].sort()).toEqual([USER_A, USER_B]);
  });

  it("never reads more than MAX_RESEARCH_OWNER_IDS entries (a pasted directory is not an allowlist)", () => {
    const many = Array.from({ length: MAX_RESEARCH_OWNER_IDS + 5 }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);
    expect(researchOwnerIds({ SCAN_LIVE_RESEARCH_OWNER_IDS: many.join(",") }).size).toBe(MAX_RESEARCH_OWNER_IDS);
  });
});

describe("POST /api/scan/research/ in owners mode", () => {
  const OFF_BODY = { status: "research_disabled", error: "Live research is not available on this deployment yet." };

  beforeEach(() => {
    process.env.SCAN_LIVE_RESEARCH_ENABLED = "owners";
  });

  it("owners mode with no list admits nobody: same 503 as off, nothing is read or queued", async () => {
    for (const list of [undefined, "", "   ", "junk", "alice@example.com"]) {
      if (list === undefined) delete process.env.SCAN_LIVE_RESEARCH_OWNER_IDS;
      else process.env.SCAN_LIVE_RESEARCH_OWNER_IDS = list;
      const res = await post({ scan_id: SCAN_A }, bearer("tok-a"));
      expect(res.status, String(list)).toBe(503);
      expect(await json(res), String(list)).toEqual(OFF_BODY);
    }
    expect(queue.jobs).toHaveLength(0);
    expect(queue.rpcCalls).toHaveLength(0);
    expect(fake.callsTo("/rest/v1/scan_runs")).toHaveLength(0);
    // Authentication still comes first: an unauthenticated caller is a 401 even with an empty list.
    delete process.env.SCAN_LIVE_RESEARCH_OWNER_IDS;
    expect((await post({ scan_id: SCAN_A })).status).toBe(401);
  });

  it("a verified Google user who is not listed gets the byte-identical OFF answer; the list is not probeable", async () => {
    process.env.SCAN_LIVE_RESEARCH_OWNER_IDS = USER_A;
    const notListed = await post({ scan_id: SCAN_B }, bearer("tok-b"));
    process.env.SCAN_LIVE_RESEARCH_ENABLED = "0";
    const off = await post({ scan_id: SCAN_B }, bearer("tok-b"));
    expect(notListed.status).toBe(503);
    expect(off.status).toBe(503);
    expect(await json(notListed)).toEqual(await json(off));
    expect(notListed.headers.get("cache-control")).toBe("no-store");
    expect(queue.jobs).toHaveLength(0);
    expect(queue.rpcCalls).toHaveLength(0);
  });

  it("the list is checked after authentication and before the body, the scan read and the queue", async () => {
    process.env.SCAN_LIVE_RESEARCH_OWNER_IDS = USER_A;
    // Not listed: the (malformed) body is never read, the scan table is never touched.
    const res = await enqueue(new Request("http://localhost/api/scan/research/", { method: "POST", headers: { Authorization: "Bearer tok-b", "Content-Type": "application/json" }, body: "not json" }));
    expect(res.status).toBe(503);
    expect(fake.callsTo("/rest/v1/scan_runs")).toHaveLength(0);
    expect(queue.rpcCalls).toHaveLength(0);
    // Unauthenticated callers are still 401, never a pass because an id is listed.
    expect((await post({ scan_id: SCAN_A })).status).toBe(401);
    expect((await post({ scan_id: SCAN_A }, bearer("nope"))).status).toBe(401);
    // A verified but non-Google user (even if its id were listed) is still refused as before.
    process.env.SCAN_LIVE_RESEARCH_OWNER_IDS = USER_C;
    expect((await post({ scan_id: SCAN_A }, bearer("tok-mail"))).status).toBe(401);
    expect(queue.jobs).toHaveLength(0);
  });

  it("a listed genuine-Google owner queues exactly like everyone-mode: 201 then idempotent 200, own scan only", async () => {
    process.env.SCAN_LIVE_RESEARCH_OWNER_IDS = `${USER_A}`;
    const first = await post({ scan_id: SCAN_A }, bearer("tok-a"));
    expect(first.status).toBe(201);
    const created = await json(first);
    expect(created.status).toBe("ok");
    expect(created.created).toBe(true);
    const again = await post({ scan_id: SCAN_A }, bearer("tok-a"));
    expect(again.status).toBe(200);
    expect((await json(again)).job.id).toBe(created.job.id);
    expect(queue.jobs).toHaveLength(1);
    // A listed owner still cannot queue someone else's scan: the same 404 as everywhere else.
    const other = await post({ scan_id: SCAN_B }, bearer("tok-a"));
    expect(other.status).toBe(404);
    expect(queue.jobs).toHaveLength(1);
    // And a body with anything but scan_id is still refused.
    expect((await post({ scan_id: SCAN_A, owner_id: USER_B }, bearer("tok-a"))).status).toBe(400);
  });

  it("only the Supabase-verified id counts: an email in the list, a client-sent id and user_metadata never match", async () => {
    // The caller (tok-b) tries every channel a client controls to look like the listed owner.
    fake.addUser("tok-spoof", {
      ...googleUser(USER_B, "alice@example.com"), // same e-mail as the listed owner's account
      user_metadata: { sub: USER_A, user_id: USER_A, id: USER_A, email: "alice@example.com" },
    });
    process.env.SCAN_LIVE_RESEARCH_OWNER_IDS = `alice@example.com, ${USER_A}`;
    const res = await enqueue(
      new Request("http://localhost/api/scan/research/", {
        method: "POST",
        headers: { Authorization: "Bearer tok-spoof", "Content-Type": "application/json", "X-User-Id": USER_A, "X-Owner-Id": USER_A },
        body: JSON.stringify({ scan_id: SCAN_B }),
      }),
    );
    expect(res.status).toBe(503);
    expect(queue.jobs).toHaveLength(0);
  });

  it("everyone mode ignores the list; off ignores it too (the list never opens anything by itself)", async () => {
    process.env.SCAN_LIVE_RESEARCH_OWNER_IDS = USER_A;
    process.env.SCAN_LIVE_RESEARCH_ENABLED = "1";
    expect((await post({ scan_id: SCAN_B }, bearer("tok-b"))).status).toBe(201);
    process.env.SCAN_LIVE_RESEARCH_ENABLED = "";
    expect((await post({ scan_id: SCAN_A }, bearer("tok-a"))).status).toBe(503);
  });
});

describe("what owners mode must NOT change", () => {
  beforeEach(() => {
    process.env.SCAN_LIVE_RESEARCH_ENABLED = "owners";
    process.env.SCAN_LIVE_RESEARCH_OWNER_IDS = USER_A;
  });

  it("the worker door follows only its own token; the mode neither opens nor closes it", async () => {
    expect((await work({ action: "claim" })).status).toBe(200);
    process.env.SCAN_LIVE_RESEARCH_ENABLED = "0";
    expect((await work({ action: "claim" })).status).toBe(200);
  });

  it("the owner-only job read is not gated by the list (it spends nothing) and keeps its 404 for other owners", async () => {
    const created = await json(await post({ scan_id: SCAN_A }, bearer("tok-a")));
    const jobId = created.job.id as string;
    // Even after the owner is removed from the list, they can still read their own job; nobody else can.
    process.env.SCAN_LIVE_RESEARCH_OWNER_IDS = USER_B;
    expect((await get(jobId, bearer("tok-a"))).status).toBe(200);
    expect((await get(jobId, bearer("tok-b"))).status).toBe(404);
    expect((await get(jobId)).status).toBe(401);
  });
});
