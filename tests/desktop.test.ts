import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  beforeAll,
  afterAll,
  beforeEach,
  afterEach,
  expect,
  it,
  vi,
} from "vitest";
const h = vi.hoisted(() => ({
  db: null as unknown as PGlite,
  cookie: "device-a",
  gmail: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (h.cookie ? { value: h.cookie } : undefined),
  }),
}));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, params: unknown[] = []) =>
    (await h.db.query(sql, params)).rows,
  transaction: async (fn: any) =>
    h.db.transaction((tx) =>
      fn({
        query: (sql: string, params: unknown[] = []) => tx.query(sql, params),
      }),
    ),
  // Exercise production control flow and real SQL; PGlite does not model advisory lock contention.
  pool: () => ({
    connect: async () => ({
      query: async () => ({ rows: [{ acquired: true }] }),
      release: () => {},
    }),
  }),
}));
vi.mock("../src/lib/server/google", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/lib/server/google")>()),
  Gmail: { forAccount: h.gmail },
}));
import { hash } from "../src/lib/server/crypto";
import {
  createPairing,
  approvePairing,
  exchangePairing,
} from "../src/lib/server/desktop-pairing";
import {
  enableDesktop,
  claimDesktop,
  completeDesktop,
  failDesktop,
} from "../src/lib/server/desktop-work";
import { usesDesktop } from "../src/lib/server/desktop-config";
import { classify } from "../src/lib/server/classifier";
import {
  classifyJob,
  workAccount,
  restoreDecision,
} from "../src/lib/server/engine";
import { distillColdPattern } from "../src/lib/server/cold-memory";
import { POST as service } from "../src/app/api/desktop/service/route";
import { POST as pairRoute } from "../src/app/api/desktop/pair/route";
import { POST as accountAction } from "../src/app/api/actions/route";
import { GmailError } from "../src/lib/server/google";
import type { Gmail } from "../src/lib/server/google";
import type { Mail, Policy } from "../src/lib/types";
const device = hash("device-a");
const verdict = {
  decision: "move",
  category: "cold",
  confidence: 0.99,
  reason: "Unsolicited individual sales outreach.",
  protected: false,
};
let labels: string[];
let mail: Mail;
let gmail: any;
beforeAll(async () => {
  h.db = new PGlite();
  for (const f of (await readdir("db"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await h.db.exec(await readFile(`db/${f}`, "utf8"));
}, 30000);
afterAll(async () => h.db.close());
beforeEach(async () => {
  vi.resetAllMocks();
  h.cookie = "device-a";
  for (const [k, v] of Object.entries({
    DESKTOP_ENABLED: "true",
    APP_URL: "https://sotto.example",
    BILLING_ENABLED: "true",
    DEMO_MODE: "false",
    ENABLE_MAILBOX_WRITES: "true",
    OPENAI_API_KEY: "synthetic",
  }))
    vi.stubEnv(k, v);
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", undefined);
  vi.stubGlobal("fetch", h.fetch);
  await h.db.exec("TRUNCATE workspaces CASCADE");
  await h.db.query(
    "INSERT INTO workspaces(id,email,internal) VALUES('a','owner@example.com',true),('b','other@example.com',true)",
  );
  await h.db.query(
    "INSERT INTO sessions(token_hash,workspace_id,expires_at) VALUES($1,'a',now()+interval '1 day'),($2,'b',now()+interval '1 day')",
    [device, hash("device-b")],
  );
  await h.db.query(
    "INSERT INTO accounts(id,email,name,token_cipher,workspace_id,mail_provider,last_sync) VALUES('mail-a','owner@example.com','Owner','','a','composio',now()),('mail-b','other@example.com','Other','','b','composio',now())",
  );
  labels = ["INBOX", "UNREAD"];
  mail = {
    id: "m",
    threadId: "t",
    from: "sales@vendor.example",
    subject: "A service for your team",
    text: "We sell design services. Could we book a call?",
    receivedAt: Date.now() + 1000,
    labels: [],
    headers: {
      "authentication-results":
        "mx.google.com; dmarc=pass header.from=vendor.example",
    },
  };
  gmail = {
    message: vi.fn(async () => ({ ...mail, labels: [...labels] })),
    threadHasReply: vi.fn(async () => false),
    hasWrittenTo: vi.fn(async () => false),
    ensureLabel: vi.fn(async () => "Label_Cold"),
    labels: vi.fn(async () => [
      { id: "Label_Cold", name: "Sotto/Cold", type: "user" },
    ]),
    renameLabel: vi.fn(async (_id: string, _name: string) => ({})),
    modify: vi.fn(async (_id: string, add: string[], remove: string[]) => {
      labels = [
        ...new Set([...labels.filter((l) => !remove.includes(l)), ...add]),
      ];
    }),
    request: vi.fn(async () => ({ historyId: "100", history: [] })),
  };
  h.gmail.mockResolvedValue(gmail);
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const rename = (
  name: string,
  accountId = "mail-a",
  origin = "https://sotto.example",
) =>
  accountAction(
    new Request("https://sotto.example/api/actions", {
      method: "POST",
      headers: { origin, "content-type": "application/json" },
      body: JSON.stringify({ action: "coldLabel", accountId, name }),
    }),
  );

it("renames the existing label without changing moved message IDs or Undo", async () => {
  const t = await task("automatic");
  await completeDesktop("a", device, t.id!, verdict);
  expect(labels).toContain("Label_Cold");
  expect((await rename("Prospección / Ventas")).status).toBe(200);
  expect(gmail.renameLabel).toHaveBeenCalledWith(
    "Label_Cold",
    "Prospección / Ventas",
  );
  const [account] = (
    await h.db.query<{ policy: Policy }>(
      "SELECT policy FROM accounts WHERE id='mail-a'",
    )
  ).rows;
  expect(account.policy).toMatchObject({
    coldLabelId: "Label_Cold",
    coldLabelName: "Prospección / Ventas",
    processingLocation: "desktop",
  });
  for (const key of [
    "DATABASE_URL",
    "ENCRYPTION_KEY",
    "ALLOWED_GOOGLE_EMAILS",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
  ])
    vi.stubEnv(key, "synthetic");
  const overview = await service(request({ action: "overview" }));
  expect(
    (await overview.json()).dashboard.accounts[0].policy.coldLabelName,
  ).toBe("Prospección / Ventas");
  const [{ id }] = (
    await h.db.query<{ id: string }>(
      "SELECT id FROM decisions WHERE account_id='mail-a'",
    )
  ).rows;
  await restoreDecision(id, gmail as Gmail);
  expect(labels).toEqual(["UNREAD", "INBOX"]);
});

it("denies another workspace, invalid names, origin failures and disabled writes before changing labels", async () => {
  expect((await rename("Sales", "mail-b")).status).toBe(404);
  expect(
    (await rename("Sales", "mail-a", "https://other.example")).status,
  ).toBe(403);
  for (const name of [
    "",
    "  ",
    "INBOX",
    "Spam",
    "Sotto/Reading",
    "bad\nlabel",
    "x".repeat(226),
  ])
    expect((await rename(name)).status).toBe(400);
  expect(h.gmail).not.toHaveBeenCalled();
  vi.stubEnv("ENABLE_MAILBOX_WRITES", "false");
  expect((await rename("Sales")).status).toBe(403);
  expect(h.gmail).not.toHaveBeenCalled();
});

it("refuses to merge with another existing label and keeps the saved name", async () => {
  gmail.labels.mockResolvedValue([
    { id: "Label_Cold", name: "Sotto/Cold" },
    { id: "Label_Another", name: "Sales" },
  ]);
  expect((await rename("sales")).status).toBe(409);
  expect(gmail.renameLabel).not.toHaveBeenCalled();
  expect(
    (
      await h.db.query<{ policy: Policy }>(
        "SELECT policy FROM accounts WHERE id='mail-a'",
      )
    ).rows[0].policy,
  ).not.toHaveProperty("coldLabelName");
});

it("recovers a rename whose Gmail response was lost using the retained label ID", async () => {
  gmail.renameLabel.mockImplementationOnce(async () => {
    gmail.labels.mockResolvedValue([{ id: "Label_Cold", name: "Sales" }]);
    throw new GmailError(504);
  });
  expect((await rename("Sales")).status).toBeGreaterThanOrEqual(400);
  expect(
    (
      await h.db.query<{ policy: Policy }>(
        "SELECT policy FROM accounts WHERE id='mail-a'",
      )
    ).rows[0].policy,
  ).toMatchObject({ coldLabelId: "Label_Cold" });
  expect((await rename("Sales")).status).toBe(200);
  expect(gmail.renameLabel).toHaveBeenCalledTimes(1);
  expect(
    (
      await h.db.query<{ policy: Policy }>(
        "SELECT policy FROM accounts WHERE id='mail-a'",
      )
    ).rows[0].policy,
  ).toMatchObject({ coldLabelName: "Sales" });
});

it("saves the choice before the first move and uses it for local classification results", async () => {
  gmail.labels.mockResolvedValue([]);
  expect((await rename("  Sales  ")).status).toBe(200);
  expect(gmail.renameLabel).not.toHaveBeenCalled();
  expect(gmail.ensureLabel).not.toHaveBeenCalled();
  const t = await task("automatic");
  await completeDesktop("a", device, t.id!, verdict);
  expect(gmail.ensureLabel).toHaveBeenCalledWith("Sales", undefined);
});
async function task(mode = "review") {
  await enableDesktop("a", device, "mail-a", mode);
  await h.db.query(
    "INSERT INTO jobs(account_id,message_id) VALUES('mail-a','m')",
  );
  return claimDesktop("a", device, "mail-a");
}
function request(body: unknown, origin = "https://sotto.example") {
  return new Request("https://sotto.example/api/desktop/service", {
    method: "POST",
    headers: { origin, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
it("pairs only with browser approval and the device's secret, once", async () => {
  const proof = "ab".repeat(32);
  const p = await createPairing(hash(proof));
  expect(await exchangePairing(p.id, proof)).toEqual({ pending: true });
  await expect(approvePairing(p.id, "a", "wrong")).rejects.toMatchObject({
    status: 409,
  });
  await approvePairing(p.id, "a", p.code);
  await expect(exchangePairing(p.id, "cd".repeat(32))).rejects.toMatchObject({
    status: 410,
  });
  const result = await exchangePairing(p.id, proof);
  expect(result.token).toBeTruthy();
  expect(
    (
      await h.db.query(
        "SELECT workspace_id FROM sessions WHERE token_hash=$1",
        [hash(result.token!)],
      )
    ).rows,
  ).toEqual([{ workspace_id: "a" }]);
  await expect(exchangePairing(p.id, proof)).rejects.toMatchObject({
    status: 410,
  });
});
it("blocks other workspaces and devices before Gmail access", async () => {
  await expect(
    enableDesktop("b", hash("device-b"), "mail-a", "review"),
  ).rejects.toMatchObject({ status: 409 });
  const t = await task();
  h.gmail.mockClear();
  await expect(
    claimDesktop("a", hash("device-b"), "mail-a"),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    completeDesktop("b", hash("device-b"), t.id!, verdict),
  ).rejects.toMatchObject({ status: 409 });
  expect(h.gmail).not.toHaveBeenCalled();
});
it("never sends local mail or corrections to cloud AI, even with the feature disabled", async () => {
  await enableDesktop("a", device, "mail-a", "review");
  vi.stubEnv("DESKTOP_ENABLED", "false");
  expect(await usesDesktop("mail-a")).toBe(true);
  await workAccount("mail-a");
  await classifyJob("mail-a", "m", gmail as Gmail);
  await expect(distillColdPattern(mail, "mail-a")).rejects.toThrow("Mac");
  await expect(
    classify(mail, {
      accountId: "mail-a",
      accountEmail: "owner@example.com",
      policy: { marketing: false, newsletters: false, protectedDomains: [] },
      allowedSenders: [],
      hasReply: false,
      previouslyContacted: false,
    }),
  ).rejects.toThrow("Mac");
  expect(h.gmail).not.toHaveBeenCalled();
  expect(h.fetch).not.toHaveBeenCalled();
});
it("keeps review suggestions, stores no body, and validates device output", async () => {
  const t = await task();
  expect(t.input).toBeTruthy();
  expect(await claimDesktop("a", device, "mail-a")).toEqual({});
  await expect(
    completeDesktop("a", device, t.id!, { ...verdict, confidence: 12 }),
  ).rejects.toMatchObject({ status: 400 });
  await completeDesktop("a", device, t.id!, verdict);
  expect(
    (await h.db.query("SELECT state,policy_version FROM decisions")).rows,
  ).toEqual([{ state: "suggested", policy_version: "local:qwen3-4b-v1" }]);
  expect(
    JSON.stringify((await h.db.query("SELECT * FROM decisions")).rows),
  ).not.toContain(mail.text);
  expect(gmail.modify).not.toHaveBeenCalled();
  expect(h.fetch).not.toHaveBeenCalled();
});

it("moves an owner's correction of a prior cloud review through the Mac action without cloud AI", async () => {
  await enableDesktop("a", device, "mail-a", "automatic");
  mail.receivedAt = Date.now() - 60_000;
  await h.db.query(
    "INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state,ai_decision,policy_version) VALUES('prior-cloud','mail-a','m','t','sales@vendor.example','A service for your team','cold',0.74,'Ambiguous outreach','kept','review','v3-owner-corrections')",
  );
  const response = await accountAction(
    new Request("https://sotto.example/api/actions", {
      method: "POST",
      headers: {
        origin: "https://sotto.example",
        "content-type": "application/json",
      },
      body: JSON.stringify({ action: "markCold", decisionId: "prior-cloud" }),
    }),
  );
  expect(response.status).toBe(200);
  expect(labels).toEqual(["UNREAD", "Label_Cold"]);
  expect(
    (
      await h.db.query(
        "SELECT state,ai_decision FROM decisions WHERE id='prior-cloud'",
      )
    ).rows[0],
  ).toEqual({ state: "moved", ai_decision: "review" });
  expect(
    (
      await h.db.query(
        "SELECT pattern FROM cold_feedback WHERE decision_id='prior-cloud'",
      )
    ).rows,
  ).toEqual([{ pattern: null }]);
  expect(h.fetch).not.toHaveBeenCalled();
  await restoreDecision("prior-cloud", gmail as Gmail);
  expect(labels).toEqual(["UNREAD", "INBOX"]);
  expect(
    (
      await h.db.query(
        "SELECT 1 FROM cold_feedback WHERE decision_id='prior-cloud'",
      )
    ).rows,
  ).toEqual([]);
});
it("rechecks allowlists added during local inference", async () => {
  const t = await task("automatic");
  await h.db.query(
    "INSERT INTO sender_rules(id,account_id,sender) VALUES('r','mail-a','sales@vendor.example')",
  );
  await completeDesktop("a", device, t.id!, verdict);
  expect((await h.db.query("SELECT state FROM decisions")).rows).toEqual([
    { state: "kept" },
  ]);
  expect(gmail.modify).not.toHaveBeenCalled();
});
it("recovers an interrupted automatic move and supports Undo without cloud AI", async () => {
  const t = await task("automatic");
  gmail.modify.mockRejectedValueOnce(new Error("Synthetic interruption"));
  await expect(completeDesktop("a", device, t.id!, verdict)).rejects.toThrow(
    "interruption",
  );
  expect(
    (await h.db.query("SELECT state,local_auto_pending FROM decisions")).rows,
  ).toEqual([{ state: "moving", local_auto_pending: true }]);
  await claimDesktop("a", device, "mail-a");
  const d = (
    await h.db.query<{ id: string }>(
      "SELECT id FROM decisions WHERE state='moved'",
    )
  ).rows[0];
  expect(d).toBeTruthy();
  expect(labels).toEqual(["UNREAD", "Label_Cold"]);
  await restoreDecision(d.id, gmail as Gmail);
  expect(labels).toEqual(["UNREAD", "INBOX"]);
  expect(h.fetch).not.toHaveBeenCalled();
});
it("recovers the gap between a saved decision and starting its automatic move", async () => {
  const t = await task("automatic");
  gmail.message
    .mockResolvedValueOnce({ ...mail, labels: [...labels] })
    .mockRejectedValueOnce(new Error("Before write"));
  await expect(completeDesktop("a", device, t.id!, verdict)).rejects.toThrow(
    "Before write",
  );
  expect(
    (await h.db.query("SELECT state,local_auto_pending FROM decisions")).rows,
  ).toEqual([{ state: "suggested", local_auto_pending: true }]);
  await claimDesktop("a", device, "mail-a");
  expect(labels).not.toContain("INBOX");
});
it("rejects stale tasks after transfer, pause, expiry or lost paid access", async () => {
  const t = await task();
  await h.db.query(
    "UPDATE desktop_leases SET expires_at=now()-interval '1 second'",
  );
  await expect(
    completeDesktop("a", device, t.id!, verdict),
  ).rejects.toMatchObject({ status: 409 });
  const next = await claimDesktop("a", device, "mail-a");
  expect(next.id).not.toBe(t.id);
  await h.db.query(
    "UPDATE workspaces SET internal=false,subscription_status='canceled' WHERE id='a'",
  );
  await expect(
    completeDesktop("a", device, next.id!, verdict),
  ).rejects.toMatchObject({ status: 402 });
  await h.db.query("UPDATE workspaces SET internal=true WHERE id='a'");
  await enableDesktop("a", device, "mail-a", "paused");
  await expect(
    completeDesktop("a", device, next.id!, verdict),
  ).rejects.toMatchObject({ status: 409 });
  expect(await claimDesktop("a", device, "mail-a")).toEqual({});
});
it("deduplicates paid allowance across retries and refuses new mail at the limit", async () => {
  await h.db.query(
    "UPDATE workspaces SET internal=false,billing_plan='solo',subscription_status='active',paid_until=now()+interval '1 day',allowance_period='period' WHERE id='a'",
  );
  await h.db.query("INSERT INTO usage_periods VALUES('a','period',249)");
  const t = await task();
  await failDesktop("a", device, t.id!);
  await h.db.query("UPDATE jobs SET available_at=now()");
  const retry = await claimDesktop("a", device, "mail-a");
  await completeDesktop("a", device, retry.id!, verdict);
  expect((await h.db.query("SELECT used FROM usage_periods")).rows).toEqual([
    { used: 250 },
  ]);
  await h.db.query(
    "INSERT INTO jobs(account_id,message_id) VALUES('mail-a','new')",
  );
  gmail.message.mockClear();
  expect(await claimDesktop("a", device, "mail-a")).toEqual({});
  expect(gmail.message).not.toHaveBeenCalled();
});
it("marks missing Gmail messages done so they cannot starve the mailbox", async () => {
  await enableDesktop("a", device, "mail-a", "review");
  await h.db.query(
    "INSERT INTO jobs(account_id,message_id) VALUES('mail-a','missing')",
  );
  gmail.message.mockRejectedValueOnce(new GmailError(404));
  expect(await claimDesktop("a", device, "mail-a")).toEqual({});
  expect((await h.db.query("SELECT state FROM jobs")).rows).toEqual([
    { state: "done" },
  ]);
});
it("requires auth, same origin, valid payloads and enabled service", async () => {
  h.cookie = "";
  expect((await service(request({ action: "overview" }))).status).toBe(401);
  h.cookie = "device-a";
  expect(
    (await service(request({ action: "overview" }, "https://other.example")))
      .status,
  ).toBe(403);
  expect(
    (await service(request({ action: "complete", id: "invalid" }))).status,
  ).toBe(400);
  const malformed = new Request("https://sotto.example/api/desktop/pair", {
    method: "POST",
    body: "{",
  });
  expect((await pairRoute(malformed)).status).toBe(400);
  vi.stubEnv("DESKTOP_ENABLED", "false");
  expect((await service(request({ action: "overview" }))).status).toBe(503);
});
it("makes canceled plans purchasable and preserves local-only status after sign out", async () => {
  await enableDesktop("a", device, "mail-a", "review");
  await h.db.query(
    "UPDATE workspaces SET internal=false,stripe_subscription_id='sub_old',subscription_status='canceled' WHERE id='a'",
  );
  const r = await service(request({ action: "overview" }));
  expect(r.status).toBe(200);
  expect((await r.json()).billing.has_subscription).toBe(false);
  expect((await service(request({ action: "signout" }))).status).toBe(200);
  expect(await usesDesktop("mail-a")).toBe(true);
  expect((await service(request({ action: "overview" }))).status).toBe(401);
});

it("does not persist free-form model explanations containing private body details", async () => {
  const t = await task();
  await completeDesktop("a", device, t.id!, {
    ...verdict,
    protected: true,
    reason: "Personal code 876543 for owner@example.com",
  });
  const saved = (
    await h.db.query<{ state: string; ai_decision: string; reason: string }>(
      "SELECT state,ai_decision,reason FROM decisions",
    )
  ).rows[0];
  expect(saved).toMatchObject({ state: "kept", ai_decision: "keep" });
  expect(saved.reason).not.toContain("876543");
  expect(saved.reason).not.toContain("owner@example.com");
});
