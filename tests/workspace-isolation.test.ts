import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";
const h = vi.hoisted(() => ({
  db: null as unknown as PGlite,
  cookie: "token-a",
  gmail: vi.fn(),
  enqueue: vi.fn(),
  restore: vi.fn(),
  work: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (h.cookie ? { value: h.cookie } : undefined),
  }),
}));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, params: unknown[] = []) =>
    (await h.db.query(sql, params)).rows,
  transaction: async (fn: (db: any) => Promise<unknown>) =>
    h.db.transaction((tx) =>
      fn({
        query: (sql: string, params: unknown[] = []) =>
          sql.includes("pg_advisory_xact_lock")
            ? Promise.resolve({ rows: [] })
            : tx.query(sql, params),
      }),
    ),
}));
// Embedded PostgreSQL tests data boundaries, not production advisory locking.
vi.mock("../src/lib/server/engine", () => ({
  withAccountLock: async (_id: string, fn: () => Promise<unknown>) => fn(),
  restoreDecision: h.restore,
  moveDecision: vi.fn(),
  workAccount: h.work,
  AccountBusy: class extends Error {},
}));
vi.mock("../src/lib/server/google", () => ({ Gmail: { forAccount: h.gmail } }));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: h.enqueue }));
import { hash } from "../src/lib/server/crypto";
import { dashboard } from "../src/lib/server/dashboard";
import { connectIdentity } from "../src/lib/server/workspaces";
import { POST as action } from "../src/app/api/actions/route";
import { consumeMailbox } from "../src/lib/server/cloud-worker";
beforeAll(async () => {
  h.db = new PGlite();
  for (const f of ["001_initial.sql", "002_billing.sql"])
    await h.db.exec(
      await readFile(new URL(`../db/${f}`, import.meta.url), "utf8"),
    );
});
afterAll(async () => h.db.close());
beforeEach(async () => {
  vi.resetAllMocks();
  h.cookie = "token-a";
  for (const [key, value] of Object.entries({
    BILLING_ENABLED: "true",
    DEMO_MODE: "false",
    APP_URL: "https://sotto.example",
    DATABASE_URL: "postgres://synthetic",
    ENCRYPTION_KEY: "11".repeat(32),
    ALLOWED_GOOGLE_EMAILS: "a@example.com,b@example.com",
    GOOGLE_CLIENT_ID: "synthetic",
    GOOGLE_CLIENT_SECRET: "synthetic",
    ENABLE_MAILBOX_WRITES: "true",
    QUEUE_DRIVER: "vercel",
  }))
    vi.stubEnv(key, value);
  await h.db.exec("TRUNCATE workspaces CASCADE");
  await h.db.query(
    "INSERT INTO workspaces(id,email) VALUES('a','a@example.com'),('b','b@example.com')",
  );
  await h.db.query(
    "INSERT INTO accounts(id,email,name,token_cipher,workspace_id) VALUES('gmail-a','a@example.com','Trabajo','synthetic','a'),('gmail-b','b@example.com','Trabajo','synthetic','b')",
  );
  for (const id of ["a", "b"]) {
    await h.db.query(
      "INSERT INTO sessions(token_hash,expires_at,workspace_id) VALUES($1,now()+interval '1 day',$2)",
      [hash(`token-${id}`), id],
    );
    await h.db.query(
      "INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state,ai_decision) VALUES($1,$2,$3,'thread','sales@example.com','Private subject','cold',0.9,'Pitch','suggested','move')",
      [`d-${id}`, `gmail-${id}`, `m-${id}`],
    );
    await h.db.query(
      "INSERT INTO sender_rules(id,account_id,sender) VALUES($1,$2,'allowed@example.com')",
      [`r-${id}`, `gmail-${id}`],
    );
  }
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: object) =>
  new Request("https://sotto.example/api/actions", {
    method: "POST",
    headers: {
      origin: "https://sotto.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
it("loads only the signed-in workspace, including decisions and sender rules", async () => {
  const a = await dashboard();
  expect(a.accounts.map((x) => x.id)).toEqual(["gmail-a"]);
  expect(a.decisions.map((x) => x.id)).toEqual(["d-a"]);
  expect(a.rules.map((x) => x.id)).toEqual(["r-a"]);
  h.cookie = "token-b";
  expect((await dashboard()).accounts.map((x) => x.id)).toEqual(["gmail-b"]);
  h.cookie = "expired";
  expect((await dashboard()).accounts).toEqual([]);
});
it("rejects foreign account, decision and rule IDs before any Gmail access", async () => {
  for (const body of [
    { action: "disconnect", accountId: "gmail-b" },
    { action: "move", decisionId: "d-b" },
    { action: "restore", decisionId: "d-b" },
    { action: "removeRule", ruleId: "r-b" },
    {
      action: "policy",
      accountId: "gmail-b",
      marketing: true,
      newsletters: true,
    },
  ])
    expect((await action(request(body))).status).toBe(404);
  expect(h.gmail).not.toHaveBeenCalled();
  expect(h.restore).not.toHaveBeenCalled();
  expect(
    (await h.db.query("SELECT state FROM decisions WHERE id='d-b'")).rows,
  ).toEqual([{ state: "suggested" }]);
});
it("expired users can keep or restore mail but cannot process or enable automatic mode", async () => {
  expect(
    (await action(request({ action: "keep", decisionId: "d-a" }))).status,
  ).toBe(200);
  for (const body of [
    { action: "sync", accountId: "gmail-a" },
    { action: "move", decisionId: "d-a" },
    { action: "mode", accountId: "gmail-a", mode: "automatic" },
  ])
    expect((await action(request(body))).status).toBe(402);
  h.gmail.mockResolvedValue({});
  h.restore.mockImplementation(async () =>
    h.db.query("UPDATE decisions SET state='restored' WHERE id='d-a'"),
  );
  expect(
    (await action(request({ action: "restore", decisionId: "d-a" }))).status,
  ).toBe(200);
  expect(
    (
      await action(
        request({ action: "mode", accountId: "gmail-a", mode: "paused" }),
      )
    ).status,
  ).toBe(200);
});
it("does not run or continue expired mailbox jobs", async () => {
  await consumeMailbox({ accountId: "gmail-a" }, { messageId: "queue-a" });
  expect(h.work).not.toHaveBeenCalled();
  expect(h.enqueue).not.toHaveBeenCalled();
  await h.db.query(
    "UPDATE workspaces SET subscription_status='trialing',trial_end=now()+interval '1 day' WHERE id='a'",
  );
  h.work.mockImplementation(async () =>
    h.db.query(
      "UPDATE workspaces SET trial_end=now()-interval '1 second' WHERE id='a'",
    ),
  );
  await consumeMailbox({ accountId: "gmail-a" }, { messageId: "queue-b" });
  expect(h.work).toHaveBeenCalledOnce();
  expect(h.enqueue).not.toHaveBeenCalled();
});
it("allows existing Google identities to sign in but refuses cross-workspace linking", async () => {
  expect(
    await connectIdentity(
      { sub: "gmail-a", email: "a@example.com" },
      "refresh-a",
      null,
    ),
  ).toBe("a");
  await expect(
    connectIdentity(
      { sub: "gmail-a", email: "a@example.com" },
      "refresh-a",
      "b",
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await h.db.query("SELECT workspace_id FROM accounts WHERE id='gmail-a'"))
      .rows,
  ).toEqual([{ workspace_id: "a" }]);
});
it("isolates a new signup and limits linked active mailboxes while allowing replacements", async () => {
  const id = await connectIdentity(
    { sub: "new-user", email: "new@example.com" },
    "refresh-new",
    null,
  );
  expect(id).not.toBe("a");
  expect(id).not.toBe("b");
  expect(id).not.toBe("installation");
  expect(
    (
      await h.db.query(
        "SELECT internal,trial_used,subscription_status FROM workspaces WHERE id=$1",
        [id],
      )
    ).rows,
  ).toEqual([
    { internal: false, trial_used: false, subscription_status: "none" },
  ]);
  await connectIdentity(
    { sub: "second-a", email: "a2@example.com" },
    "refresh",
    "a",
  );
  await expect(
    connectIdentity(
      { sub: "third-a", email: "a3@example.com" },
      "refresh",
      "a",
    ),
  ).rejects.toMatchObject({ status: 409 });
  await h.db.query(
    "UPDATE accounts SET connected=false,token_cipher='' WHERE id='second-a'",
  );
  await connectIdentity(
    { sub: "third-a", email: "a3@example.com" },
    "refresh",
    "a",
  );
  await expect(
    connectIdentity(
      { sub: "second-a", email: "a2@example.com" },
      "refresh",
      "a",
    ),
  ).rejects.toMatchObject({ status: 409 });
});
