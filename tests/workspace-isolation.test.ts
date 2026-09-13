import { readFile } from "node:fs/promises";
import { createHmac } from "node:crypto";
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
  move: vi.fn(),
  work: vi.fn(),
  lock: vi.fn(),
  verifyPush: vi.fn(),
  beforeQuery: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (h.cookie ? { value: h.cookie } : undefined),
  }),
}));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, params: unknown[] = []) => {
    await h.beforeQuery(sql, params);
    return (await h.db.query(sql, params)).rows;
  },
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
  withAccountLock: h.lock,
  restoreDecision: h.restore,
  moveDecision: h.move,
  workAccount: h.work,
  AccountBusy: class extends Error {},
}));
vi.mock("../src/lib/server/google", () => ({ Gmail: { forAccount: h.gmail } }));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: h.enqueue }));
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = h.verifyPush;
  },
}));
import { hash } from "../src/lib/server/crypto";
import { dashboard } from "../src/lib/server/dashboard";
import { connectIdentity } from "../src/lib/server/workspaces";
import { POST as action } from "../src/app/api/actions/route";
import { consumeMailbox } from "../src/lib/server/cloud-worker";
import { AccountBusy } from "../src/lib/server/engine";
import { POST as gmailEvent } from "../src/app/api/gmail/events/route";
import { createSession } from "../src/lib/server/auth";
import { POST as composioEvent } from "../src/app/api/composio/events/route";
beforeAll(async () => {
  h.db = new PGlite();
  for (const f of [
    "001_initial.sql",
    "002_billing.sql",
    "003_mailbox_deletion.sql",
    "004_english_explanations.sql",
    "005_automatic_connection.sql",
    "006_composio.sql",
    "007_plans.sql",
    "008_mail_allowances.sql",
    "009_global_config.sql",
    "010_identity_profile.sql",
  ])
    await h.db.exec(
      await readFile(new URL(`../db/${f}`, import.meta.url), "utf8"),
    );
});
afterAll(async () => h.db.close());
beforeEach(async () => {
  vi.resetAllMocks();
  h.lock.mockImplementation(async (_id: string, fn: () => Promise<unknown>) =>
    fn(),
  );
  h.cookie = "token-a";
  h.verifyPush.mockResolvedValue({
    getPayload: () => ({
      email: "push@project.iam.gserviceaccount.com",
      email_verified: true,
    }),
  });
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
    PUBSUB_AUDIENCE: "https://sotto.example/api/gmail/events",
    PUBSUB_SERVICE_ACCOUNT_EMAIL: "push@project.iam.gserviceaccount.com",
  }))
    vi.stubEnv(key, value);
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", undefined);
  await h.db.exec("TRUNCATE workspaces CASCADE; TRUNCATE composio_cleanup");
  await h.db.query(
    "INSERT INTO workspaces(id,email,billing_plan) VALUES('a','a@example.com','duo'),('b','b@example.com','duo')",
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
it("reports expired access without hiding history or mailbox controls", async () => {
  vi.stubEnv("BILLING_ENABLED", "true");
  await h.db.query(
    "UPDATE workspaces SET subscription_status='trialing',trial_end=now()-interval '1 second' WHERE id='a'",
  );
  const expired = await dashboard();
  expect(expired.accessActive).toBe(false);
  expect(expired.accounts.map((a) => a.id)).toEqual(["gmail-a"]);
  expect(expired.decisions.map((d) => d.id)).toEqual(["d-a"]);
  await h.db.query(
    "UPDATE workspaces SET subscription_status='active',paid_until=now()+interval '1 day' WHERE id='a'",
  );
  expect((await dashboard()).accessActive).toBe(true);
});
it("displays an English explanation without changing its audit source and ignores stale translations", async () => {
  await h.db.query(
    "UPDATE decisions SET reason=$1, reason_en_source=$1, reason_en=$2 WHERE id='d-a'",
    ["Oferta comercial no solicitada.", "Unsolicited sales pitch."],
  );
  const translated = await dashboard();
  expect(translated.accounts[0].name).toBe("Work");
  expect(translated.decisions[0].reason).toBe("Unsolicited sales pitch.");
  expect(
    (await h.db.query("SELECT reason FROM decisions WHERE id='d-a'")).rows,
  ).toEqual([{ reason: "Oferta comercial no solicitada." }]);

  await h.db.query(
    "UPDATE decisions SET reason='Sender added to the allowlist.' WHERE id='d-a'",
  );
  expect((await dashboard()).decisions[0].reason).toBe(
    "Sender added to the allowlist.",
  );
});
it("keeps the latest 200 activities per account, including newly moved older mail, without leaking another workspace", async () => {
  await h.db.query("DELETE FROM decisions");
  await h.db.query(
    "INSERT INTO accounts(id,email,name,token_cipher,workspace_id) VALUES('personal-a','personal@example.com','Personal','synthetic','a')",
  );
  await h.db
    .query(`INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state,ai_decision,created_at)
    SELECT 'work-' || n,'gmail-a','work-message-' || n,'work-thread-' || n,
      'sales@example.com','Synthetic pitch','cold',0.9,'Pitch','suggested','move',
      '2026-09-01'::timestamptz + n * interval '1 second'
    FROM generate_series(1,230) AS n`);
  await h.db
    .query(`INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state,ai_decision,created_at)
    SELECT id,account_id,id,id,'sales@example.com','Synthetic pitch','cold',0.9,'Pitch','suggested','move',created_at::timestamptz
    FROM (VALUES
      ('personal-old','personal-a','2026-08-01'),
      ('personal-new','personal-a','2026-08-02'),
      ('foreign-new','gmail-b','2026-10-01')
    ) AS seeds(id,account_id,created_at)`);

  await h.db.query("UPDATE decisions SET updated_at=created_at");
  const data = await dashboard();
  expect(data.decisions.map((d) => d.id)).toEqual([
    ...Array.from({ length: 200 }, (_, i) => `work-${230 - i}`),
    "personal-new",
    "personal-old",
  ]);
  expect(
    data.decisions.filter((d) => d.accountId === "personal-a"),
  ).toHaveLength(2);
  await h.db.query(
    "UPDATE decisions SET state='moved',updated_at='2026-10-02' WHERE id='work-1'",
  );
  const moved = await dashboard();
  expect(moved.decisions[0]).toMatchObject({ id: "work-1", state: "moved" });
  expect(moved.decisions.filter((d) => d.accountId === "gmail-a")).toHaveLength(
    200,
  );
  h.cookie = "token-b";
  expect((await dashboard()).decisions.map((d) => d.id)).toEqual([
    "foreign-new",
  ]);
  h.cookie = "expired";
  expect((await dashboard()).decisions).toEqual([]);
});
it("rejects foreign account, decision and rule IDs before any Gmail access", async () => {
  for (const body of [
    { action: "disconnect", accountId: "gmail-b" },
    {
      action: "deleteGmailData",
      accountId: "gmail-b",
      confirmEmail: "b@example.com",
    },
    { action: "sync", accountId: "gmail-b" },
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
it("reports the complete backlog for only the signed-in workspace", async () => {
  await h.db.query(`INSERT INTO jobs(account_id,message_id,state,last_error)
    VALUES('gmail-a','done','done',NULL),('gmail-a','pending','pending',NULL),
    ('gmail-a','retry','pending','classifier_http_429'),('gmail-a','running','running',NULL),
    ('gmail-a','failed','failed','provider_timeout'),('gmail-b','private','pending',NULL)`);
  expect((await dashboard()).accounts[0].sync).toMatchObject({
    total: 5,
    done: 1,
    pending: 3,
    failed: 1,
    retrying: 1,
  });
});
it("allows only the listed account to move, restore or enable automation within the same workspace", async () => {
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", "demo-a");
  vi.stubEnv("OPENAI_API_KEY", "synthetic");
  await h.db.query("UPDATE workspaces SET internal=true WHERE id='a'");
  await h.db.query("UPDATE accounts SET reviewed_at=now() WHERE id='gmail-a'");
  await h.db.query(
    "INSERT INTO accounts(id,email,name,token_cipher,workspace_id,reviewed_at) VALUES('demo-a','demo@example.com','Demo','synthetic','a',now())",
  );
  await h.db.query(
    "INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state,ai_decision) VALUES('d-demo','demo-a','demo-message','demo-thread','sales@example.com','Synthetic pitch','cold',0.9,'Pitch','suggested','move')",
  );
  expect(
    (await action(request({ action: "move", decisionId: "d-a" }))).status,
  ).toBe(409);
  await h.db.query("UPDATE decisions SET state='moved' WHERE id='d-a'");
  expect(
    (await action(request({ action: "restore", decisionId: "d-a" }))).status,
  ).toBe(409);
  expect(
    (
      await action(
        request({ action: "mode", accountId: "gmail-a", mode: "automatic" }),
      )
    ).status,
  ).toBe(409);
  expect(h.gmail).not.toHaveBeenCalled();
  h.gmail.mockResolvedValue({});
  h.move.mockImplementation(async (id: string) =>
    h.db.query("UPDATE decisions SET state='moved' WHERE id=$1", [id]),
  );
  h.restore.mockImplementation(async (id: string) =>
    h.db.query("UPDATE decisions SET state='restored' WHERE id=$1", [id]),
  );
  expect(
    (await action(request({ action: "move", decisionId: "d-demo" }))).status,
  ).toBe(200);
  expect(
    (await action(request({ action: "restore", decisionId: "d-demo" }))).status,
  ).toBe(200);
  expect(
    (
      await action(
        request({ action: "mode", accountId: "demo-a", mode: "automatic" }),
      )
    ).status,
  ).toBe(200);
  expect(h.gmail.mock.calls).toEqual([["demo-a"], ["demo-a"]]);
  expect(
    (await h.db.query("SELECT mode FROM accounts WHERE id='gmail-a'")).rows,
  ).toEqual([{ mode: "review" }]);
  const data = await dashboard();
  expect(data.accounts.map((a) => [a.id, a.writesEnabled]).sort()).toEqual([
    ["demo-a", true],
    ["gmail-a", false],
  ]);
});
it.each(["", "gmail-a,", "*"])(
  "denies API writes for a configured invalid list (%s)",
  async (list) => {
    vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", list);
    await h.db.query("UPDATE workspaces SET internal=true WHERE id='a'");
    expect(
      (await action(request({ action: "move", decisionId: "d-a" }))).status,
    ).toBe(409);
    expect(h.gmail).not.toHaveBeenCalled();
    expect((await dashboard()).accounts[0].writesEnabled).toBe(false);
  },
);
it("disconnects locally when the stored Gmail credential cannot be opened", async () => {
  await h.db.query(
    "UPDATE accounts SET mode='automatic',watch_expires=now()+interval '1 day' WHERE id='gmail-a'",
  );
  h.gmail.mockRejectedValue(new Error("Invalid encrypted credential"));

  const response = await action(
    request({ action: "disconnect", accountId: "gmail-a" }),
  );

  expect(response.status).toBe(200);
  expect(
    (
      await h.db.query(
        "SELECT connected,mode,token_cipher,watch_expires FROM accounts WHERE id='gmail-a'",
      )
    ).rows,
  ).toEqual([
    { connected: false, mode: "paused", token_cipher: "", watch_expires: null },
  ]);
  expect(
    (await h.db.query("SELECT state FROM decisions WHERE id='d-a'")).rows,
  ).toEqual([{ state: "suggested" }]);
  expect(
    (
      await h.db.query(
        "SELECT connected,token_cipher FROM accounts WHERE id='gmail-b'",
      )
    ).rows,
  ).toEqual([{ connected: true, token_cipher: "synthetic" }]);
});
it("removes local access before trying Google cleanup and still attempts revocation if stopping the watch fails", async () => {
  const observedStates: unknown[] = [];
  const cleanup = async () => {
    observedStates.push(
      (
        await h.db.query(
          "SELECT connected,mode,token_cipher FROM accounts WHERE id='gmail-a'",
        )
      ).rows,
    );
    throw new Error("Google unavailable");
  };
  const stop = vi.fn(cleanup);
  const revoke = vi.fn(cleanup);
  h.gmail.mockResolvedValue({ stop, revoke });

  expect(
    (await action(request({ action: "disconnect", accountId: "gmail-a" })))
      .status,
  ).toBe(200);
  expect(stop).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledOnce();
  expect(observedStates).toEqual([
    [{ connected: false, mode: "paused", token_cipher: "" }],
    [{ connected: false, mode: "paused", token_cipher: "" }],
  ]);
});
it("accepts sync during classification without resetting running jobs", async () => {
  await h.db.query("UPDATE workspaces SET internal=true WHERE id='a'");
  await h.db.query(`INSERT INTO jobs(account_id,message_id,state,attempts)
    VALUES('gmail-a','running','running',2),('gmail-a','failed','failed',8)`);
  h.lock.mockRejectedValue(new Error("Worker holds the mailbox lock"));
  expect(
    (await action(request({ action: "sync", accountId: "gmail-a" }))).status,
  ).toBe(202);
  expect(h.lock).not.toHaveBeenCalled();
  expect(h.enqueue).toHaveBeenCalledWith("gmail-a");
  expect(
    (
      await h.db.query(
        "SELECT message_id,state,attempts FROM jobs ORDER BY message_id",
      )
    ).rows,
  ).toEqual([
    { message_id: "failed", state: "pending", attempts: 0 },
    { message_id: "running", state: "running", attempts: 2 },
  ]);
  for (const update of ["mode='paused'", "mode='review',connected=false"]) {
    await h.db.query(`UPDATE accounts SET ${update} WHERE id='gmail-a'`);
    expect(
      (await action(request({ action: "sync", accountId: "gmail-a" }))).status,
    ).toBe(409);
  }
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
it("isolates unrelated first logins without billing, including their dashboards", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  const first = await connectIdentity(
    { sub: "new-first", email: "first@example.com" },
    "refresh-first",
    null,
  );
  const second = await connectIdentity(
    { sub: "new-second", email: "second@example.com" },
    "refresh-second",
    null,
  );
  expect(first).not.toBe(second);
  expect(["a", "b", "installation"]).not.toContain(first);
  expect(["a", "b", "installation"]).not.toContain(second);
  h.cookie = await createSession(first);
  expect((await dashboard()).accounts.map((a) => a.id)).toEqual(["new-first"]);
  expect((await dashboard()).decisions).toEqual([]);
  h.cookie = await createSession(second);
  expect((await dashboard()).accounts.map((a) => a.id)).toEqual(["new-second"]);
  await expect(
    connectIdentity(
      { sub: "new-first", email: "first@example.com" },
      "refresh-first",
      second,
    ),
  ).rejects.toMatchObject({ status: 409 });
});
it("shares a workspace only for explicit linking when billing is disabled", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  expect(
    await connectIdentity(
      { sub: "linked-new", email: "linked@example.com" },
      "refresh-linked",
      "a",
    ),
  ).toBe("a");
  expect((await dashboard()).accounts.map((a) => a.id).sort()).toEqual([
    "gmail-a",
    "linked-new",
  ]);
  // A subsequent sign-in follows that identity's ownership without linking.
  expect(
    await connectIdentity(
      { sub: "linked-new", email: "linked@example.com" },
      "refresh-linked",
      null,
    ),
  ).toBe("a");
});
it("preserves legacy installation ownership with and without a retained Gmail connection", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  await h.db.query(
    "INSERT INTO workspaces(id,email,internal) VALUES('installation','legacy@example.com',true)",
  );
  await h.db.query(
    "UPDATE accounts SET workspace_id='installation' WHERE id='gmail-a'",
  );
  expect(
    await connectIdentity(
      { sub: "gmail-a", email: "a@example.com" },
      "refresh-legacy",
      null,
    ),
  ).toBe("installation");
  await h.db.query("DELETE FROM accounts WHERE id='gmail-a'");
  // The minimal identity, rather than billing configuration, preserves access.
  expect(
    await connectIdentity(
      { sub: "gmail-a", email: "a@example.com" },
      "refresh-legacy",
      null,
    ),
  ).toBe("installation");
  expect(
    (await h.db.query("SELECT workspace_id FROM accounts WHERE id='gmail-a'"))
      .rows,
  ).toEqual([{ workspace_id: "installation" }]);
});

const deletion = {
  action: "deleteGmailData",
  accountId: "gmail-a",
  confirmEmail: "a@example.com",
};
const mailboxTables = ["decisions", "jobs", "mailbox_events", "sender_rules"];
async function mailboxData(accountId: string) {
  const snapshot: Record<string, unknown> = {
    accounts: (
      await h.db.query("SELECT * FROM accounts WHERE id=$1", [accountId])
    ).rows,
  };
  for (const table of mailboxTables)
    snapshot[table] = (
      await h.db.query(
        `SELECT * FROM ${table} WHERE account_id=$1 ORDER BY id`,
        [accountId],
      )
    ).rows;
  return snapshot;
}
it("requires a session, the canonical origin and explicit matching confirmation before deletion", async () => {
  h.cookie = "";
  expect((await action(request(deletion))).status).toBe(401);
  h.cookie = "token-a";
  const foreign = request(deletion);
  foreign.headers.set("origin", "https://other.example");
  expect((await action(foreign)).status).toBe(403);
  expect(
    (await action(request({ action: "deleteGmailData", accountId: "gmail-a" })))
      .status,
  ).toBe(400);
  expect(
    (await action(request({ ...deletion, confirmEmail: "wrong@example.com" })))
      .status,
  ).toBe(400);
  expect(h.gmail).not.toHaveBeenCalled();
  expect(
    (await h.db.query("SELECT token_cipher FROM accounts WHERE id='gmail-a'"))
      .rows,
  ).toEqual([{ token_cipher: "synthetic" }]);
  expect(
    (await h.db.query("SELECT id FROM decisions WHERE account_id='gmail-a'"))
      .rows,
  ).toEqual([{ id: "d-a" }]);
});
it("purges every Gmail record even with a damaged credential, isolating other accounts and preserving access and billing", async () => {
  await h.db.query(
    "INSERT INTO accounts(id,email,name,token_cipher,workspace_id) VALUES('second-a','second@example.com','Personal','other-token','a')",
  );
  await h.db.query(
    "INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state) VALUES('second-decision','second-a','second-message','second-thread','sender@example.com','Keep this','cold',0.9,'Pitch','suggested')",
  );
  await h.db.query(
    "INSERT INTO sender_rules(id,account_id,sender) VALUES('second-rule','second-a','sender@example.com')",
  );
  for (const accountId of ["gmail-a", "second-a", "gmail-b"]) {
    for (const state of ["pending", "running", "done", "failed"])
      await h.db.query(
        "INSERT INTO jobs(account_id,message_id,state) VALUES($1,$2,$2)",
        [accountId, state],
      );
    await h.db.query(
      "INSERT INTO mailbox_events(id,account_id,history_id) VALUES($1,$2,'100')",
      [`event-${accountId}`, accountId],
    );
  }
  await h.db.query(
    "UPDATE workspaces SET stripe_customer_id='customer-a',subscription_status='active',paid_until=now()+interval '1 day' WHERE id='a'",
  );
  const peers = await Promise.all([
    mailboxData("second-a"),
    mailboxData("gmail-b"),
  ]);
  const workspace = (await h.db.query("SELECT * FROM workspaces WHERE id='a'"))
    .rows;
  h.gmail.mockRejectedValue(new Error("Invalid encrypted credential"));

  expect((await action(request(deletion))).status).toBe(200);

  expect(await mailboxData("gmail-a")).toEqual({
    accounts: [],
    decisions: [],
    jobs: [],
    mailbox_events: [],
    sender_rules: [],
  });
  expect(
    await Promise.all([mailboxData("second-a"), mailboxData("gmail-b")]),
  ).toEqual(peers);
  expect(
    (await h.db.query("SELECT * FROM workspaces WHERE id='a'")).rows,
  ).toEqual(workspace);
  expect((await dashboard()).authenticated).toBe(true);
  expect((await dashboard()).accounts.map((a) => a.id)).toEqual(["second-a"]);
  const identity = (
    await h.db.query("SELECT * FROM workspace_identities WHERE id='gmail-a'")
  ).rows[0];
  expect(identity).toEqual({
    id: "gmail-a",
    workspace_id: "a",
    gmail_deleted_at: expect.any(Date),
    name: null,
    picture: null,
  });
  expect(h.enqueue).not.toHaveBeenCalled();
});
it("commits local deletion before remote cleanup and ignores deliveries for the deleted account", async () => {
  const observed: unknown[] = [];
  const cleanup = async () => {
    observed.push(await mailboxData("gmail-a"));
    throw new Error("Google unavailable");
  };
  const stop = vi.fn(cleanup),
    revoke = vi.fn(cleanup),
    modify = vi.fn();
  h.gmail.mockResolvedValue({ stop, revoke, modify });
  expect((await action(request(deletion))).status).toBe(200);
  expect(stop).toHaveBeenCalledOnce();
  expect(revoke).toHaveBeenCalledOnce();
  expect(modify).not.toHaveBeenCalled();
  expect(observed).toEqual(
    Array(2).fill({
      accounts: [],
      decisions: [],
      jobs: [],
      mailbox_events: [],
      sender_rules: [],
    }),
  );
  await consumeMailbox(
    { accountId: "gmail-a" },
    { messageId: "old-queue-delivery" },
  );
  expect(h.work).not.toHaveBeenCalled();
  expect(h.enqueue).not.toHaveBeenCalled();
  expect(
    (await action(request({ action: "sync", accountId: "gmail-a" }))).status,
  ).toBe(404);
});
it("also deletes the retained data of a disconnected account without Gmail access", async () => {
  await h.db.query(
    "UPDATE accounts SET connected=false,mode='paused',token_cipher='' WHERE id='gmail-a'",
  );
  expect((await action(request(deletion))).status).toBe(200);
  expect(h.gmail).not.toHaveBeenCalled();
  expect(await mailboxData("gmail-a")).toEqual({
    accounts: [],
    decisions: [],
    jobs: [],
    mailbox_events: [],
    sender_rules: [],
  });
});
it("requires the worker lock to be released before it can delete Gmail data", async () => {
  const before = await mailboxData("gmail-a");
  h.lock.mockRejectedValueOnce(new AccountBusy());
  expect((await action(request(deletion))).status).toBe(409);
  expect(await mailboxData("gmail-a")).toEqual(before);
  expect(h.gmail).not.toHaveBeenCalled();
  expect((await action(request(deletion))).status).toBe(200);
  expect(
    (await h.db.query("SELECT id FROM accounts WHERE id='gmail-a'")).rows,
  ).toEqual([]);
});
it("rejects pre-deletion OAuth callbacks and reconnects only into the original workspace with fresh consent", async () => {
  const priorAuthorization = new Date(0);
  expect((await action(request(deletion))).status).toBe(200);
  await expect(
    connectIdentity(
      { sub: "gmail-a", email: "a@example.com" },
      "new-refresh",
      null,
      priorAuthorization,
    ),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    connectIdentity(
      { sub: "gmail-a", email: "a@example.com" },
      "new-refresh",
      null,
    ),
  ).rejects.toMatchObject({ status: 409 });
  const freshAuthorization = new Date(Date.now() + 1000);
  await expect(
    connectIdentity(
      { sub: "gmail-a", email: "a@example.com" },
      "new-refresh",
      "b",
      freshAuthorization,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    (await h.db.query("SELECT id FROM accounts WHERE id='gmail-a'")).rows,
  ).toEqual([]);
  expect(
    await connectIdentity(
      { sub: "gmail-a", email: "a@example.com" },
      "new-refresh",
      null,
      freshAuthorization,
    ),
  ).toBe("a");
  expect(
    (
      await h.db.query(
        "SELECT workspace_id,mode,connected,history_id,reviewed_at FROM accounts WHERE id='gmail-a'",
      )
    ).rows,
  ).toEqual([
    {
      workspace_id: "a",
      mode: "review",
      connected: true,
      history_id: null,
      reviewed_at: null,
    },
  ]);
  expect(
    (await h.db.query("SELECT id FROM decisions WHERE account_id='gmail-a'"))
      .rows,
  ).toEqual([]);
});
it("backfills login ownership idempotently without resurrecting deleted Gmail data", async () => {
  const migration = await readFile(
    new URL("../db/003_mailbox_deletion.sql", import.meta.url),
    "utf8",
  );
  await h.db.exec(migration);
  expect((await action(request(deletion))).status).toBe(200);
  const identities = (
    await h.db.query("SELECT * FROM workspace_identities ORDER BY id")
  ).rows;
  await h.db.exec(migration);
  expect(
    (await h.db.query("SELECT * FROM workspace_identities ORDER BY id")).rows,
  ).toEqual(identities);
  expect(
    (await h.db.query("SELECT id FROM accounts ORDER BY id")).rows,
  ).toEqual([{ id: "gmail-b" }]);
});
it("retries a saved Gmail push after queue failure, but ignores it after deletion", async () => {
  const push = () =>
    new Request("https://sotto.example/api/gmail/events", {
      method: "POST",
      headers: { authorization: "Bearer synthetic" },
      body: JSON.stringify({
        message: {
          messageId: "push-a",
          data: Buffer.from(
            JSON.stringify({ emailAddress: "a@example.com", historyId: "123" }),
          ).toString("base64"),
        },
      }),
    });
  h.enqueue.mockRejectedValueOnce(new Error("Queue unavailable"));
  expect((await gmailEvent(push())).status).toBe(503);
  expect(
    (await h.db.query("SELECT id,account_id FROM mailbox_events")).rows,
  ).toEqual([{ id: "push-a", account_id: "gmail-a" }]);
  expect((await gmailEvent(push())).status).toBe(204);
  expect(h.enqueue).toHaveBeenCalledTimes(2);
  expect(
    (await h.db.query("SELECT count(*)::int AS n FROM mailbox_events")).rows,
  ).toEqual([{ n: 1 }]);
  expect((await action(request(deletion))).status).toBe(200);
  h.enqueue.mockClear();
  expect((await gmailEvent(push())).status).toBe(204);
  expect((await h.db.query("SELECT id FROM mailbox_events")).rows).toEqual([]);
  expect(h.enqueue).not.toHaveBeenCalled();
});
it("does not recreate work when deletion completes during a manual sync request", async () => {
  await h.db.query("UPDATE workspaces SET internal=true WHERE id='a'");
  let interrupted = false;
  h.beforeQuery.mockImplementation(async (sql: string) => {
    if (!interrupted && sql.includes("INSERT INTO mailbox_events")) {
      interrupted = true;
      expect((await action(request(deletion))).status).toBe(200);
    }
  });
  expect(
    (await action(request({ action: "sync", accountId: "gmail-a" }))).status,
  ).toBe(409);
  expect(interrupted).toBe(true);
  expect(await mailboxData("gmail-a")).toEqual({
    accounts: [],
    decisions: [],
    jobs: [],
    mailbox_events: [],
    sender_rules: [],
  });
  expect(h.enqueue).not.toHaveBeenCalled();
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
it("allows only one connected Gmail on Solo, then permits a second on Duo", async () => {
  await h.db.query("UPDATE workspaces SET billing_plan='solo' WHERE id='a'");
  await expect(
    connectIdentity(
      { sub: "extra", email: "extra@example.com" },
      "synthetic",
      "a",
    ),
  ).rejects.toMatchObject({ code: "account_limit" });
  await h.db.query("UPDATE workspaces SET billing_plan='duo' WHERE id='a'");
  expect(
    await connectIdentity(
      { sub: "extra", email: "extra@example.com" },
      "synthetic",
      "a",
    ),
  ).toBe("a");
});

it("starts filtering on explicitly authorized connections without a pretend review, and preserves old OAuth behavior", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  vi.stubEnv("OPENAI_API_KEY", "synthetic");
  const startedAt = new Date();
  await connectIdentity(
    { sub: "new-auto", email: "auto@example.com" },
    "refresh",
    null,
    startedAt,
    true,
  );
  const {
    rows: [account],
  } = await h.db.query(`SELECT mode,reviewed_at,automatic_authorized_at,
    auto_after= start_at AS includes_initial_scan FROM accounts WHERE id='new-auto'`);
  expect(account).toEqual({
    mode: "automatic",
    reviewed_at: null,
    automatic_authorized_at: expect.any(Date),
    includes_initial_scan: true,
  });
  expect(
    (await h.db.query("SELECT account_id FROM mailbox_events")).rows,
  ).toEqual([{ account_id: "new-auto" }]);
  await connectIdentity(
    { sub: "old-oauth", email: "old@example.com" },
    "refresh",
    null,
    startedAt,
  );
  expect(
    (await h.db.query("SELECT mode FROM accounts WHERE id='old-oauth'")).rows,
  ).toEqual([{ mode: "review" }]);
});

it("does not let an earlier OAuth flow undo a later pause or bypass account write restrictions", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  vi.stubEnv("OPENAI_API_KEY", "synthetic");
  const beforePause = new Date(0);
  await h.db.query(
    "UPDATE accounts SET mode='paused',mode_changed_at=now() WHERE id='gmail-a'",
  );
  await connectIdentity(
    { sub: "gmail-a", email: "a@example.com" },
    "refresh",
    null,
    beforePause,
    true,
  );
  expect(
    (await h.db.query("SELECT mode FROM accounts WHERE id='gmail-a'")).rows,
  ).toEqual([{ mode: "paused" }]);
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", "gmail-a");
  await connectIdentity(
    { sub: "blocked", email: "blocked@example.com" },
    "refresh",
    null,
    new Date(),
    true,
  );
  expect(
    (
      await h.db.query(
        "SELECT mode,automatic_authorized_at FROM accounts WHERE id='blocked'",
      )
    ).rows,
  ).toEqual([{ mode: "review", automatic_authorized_at: null }]);
});

it("starts an existing inbox in one action, queues suggestions durably and leaves user decisions and other accounts alone", async () => {
  vi.stubEnv("OPENAI_API_KEY", "synthetic");
  await h.db.query("UPDATE workspaces SET internal=true WHERE id='a'");
  await h.db.query(
    "UPDATE accounts SET start_at=now()-interval '30 days' WHERE id='gmail-a'",
  );
  await h.db
    .query(`INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state)
    VALUES('kept','gmail-a','kept','t','x@example.com','Kept','cold',0.9,'Mine','kept'),
          ('restored','gmail-a','restored','t','x@example.com','Restored','cold',0.9,'Mine','restored')`);
  await h.db.query(
    "INSERT INTO jobs(account_id,message_id,state) VALUES('gmail-a','m-a','done'),('gmail-a','kept','done'),('gmail-a','restored','done')",
  );
  const result = await action(
    request({ action: "startFiltering", accountId: "gmail-a" }),
  );
  expect(result.status).toBe(200);
  const {
    rows: [account],
  } = await h.db.query<{
    auto_after: Date;
  }>(`SELECT mode,reviewed_at,automatic_authorized_at,auto_after,history_id,
    auto_after > now()-interval '8 days' AND auto_after < now()-interval '6 days' AS recent_only FROM accounts WHERE id='gmail-a'`);
  expect(account).toMatchObject({
    mode: "automatic",
    reviewed_at: null,
    automatic_authorized_at: expect.any(Date),
    history_id: null,
    recent_only: true,
  });
  expect(
    (await h.db.query("SELECT message_id,state FROM jobs ORDER BY message_id"))
      .rows,
  ).toEqual([
    { message_id: "kept", state: "done" },
    { message_id: "m-a", state: "pending" },
    { message_id: "restored", state: "done" },
  ]);
  expect(
    (await h.db.query("SELECT mode FROM accounts WHERE id='gmail-b'")).rows,
  ).toEqual([{ mode: "review" }]);
  expect(h.enqueue).toHaveBeenCalledWith("gmail-a");
  expect(
    (await action(request({ action: "startFiltering", accountId: "gmail-a" })))
      .status,
  ).toBe(200);
  expect(
    (
      await h.db.query<{ auto_after: Date }>(
        "SELECT auto_after FROM accounts WHERE id='gmail-a'",
      )
    ).rows[0].auto_after,
  ).toEqual(account.auto_after);
  expect(
    (await h.db.query("SELECT count(*)::int AS n FROM mailbox_events")).rows,
  ).toEqual([{ n: 1 }]);
  h.cookie = "token-b";
  expect(
    (await action(request({ action: "startFiltering", accountId: "gmail-a" })))
      .status,
  ).toBe(404);
});

it("keeps activation durable after queue publication fails and refuses filtering without AI or write access", async () => {
  await h.db.query("UPDATE workspaces SET internal=true WHERE id='a'");
  vi.stubEnv("OPENAI_API_KEY", "");
  expect(
    (await action(request({ action: "startFiltering", accountId: "gmail-a" })))
      .status,
  ).toBe(409);
  vi.stubEnv("OPENAI_API_KEY", "synthetic");
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", "gmail-b");
  expect(
    (await action(request({ action: "startFiltering", accountId: "gmail-a" })))
      .status,
  ).toBe(409);
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", "gmail-a");
  h.enqueue.mockRejectedValueOnce(new Error("Synthetic queue unavailable"));
  expect(
    (await action(request({ action: "startFiltering", accountId: "gmail-a" })))
      .status,
  ).toBe(500);
  expect(
    (await h.db.query("SELECT mode FROM accounts WHERE id='gmail-a'")).rows,
  ).toEqual([{ mode: "automatic" }]);
  expect(
    (await h.db.query("SELECT account_id,processed_at FROM mailbox_events"))
      .rows,
  ).toEqual([{ account_id: "gmail-a", processed_at: null }]);
});

it("migrates a Google identity to Composio without losing history or allowing another workspace to claim it", async () => {
  await h.db.query(
    "UPDATE accounts SET mode='paused',history_id='9007199254740993',last_watch=now(),watch_expires=now()+interval '1 day' WHERE id='gmail-a'",
  );
  const connection = { id: "ca-a", userId: "sotto-private-a" };
  await expect(
    connectIdentity(
      { sub: "gmail-a", email: "a@example.com" },
      undefined,
      "b",
      new Date(),
      false,
      connection,
    ),
  ).rejects.toMatchObject({ status: 409 });
  expect(
    await connectIdentity(
      { sub: "gmail-a", email: "a@example.com" },
      undefined,
      "a",
      new Date(),
      false,
      connection,
    ),
  ).toBe("a");
  expect(
    (
      await h.db.query(
        "SELECT workspace_id,mode,history_id,token_cipher,mail_provider,composio_account_id,composio_user_id,last_watch,watch_expires FROM accounts WHERE id='gmail-a'",
      )
    ).rows,
  ).toEqual([
    {
      workspace_id: "a",
      mode: "paused",
      history_id: "9007199254740993",
      token_cipher: "",
      mail_provider: "composio",
      composio_account_id: "ca-a",
      composio_user_id: "sotto-private-a",
      last_watch: null,
      watch_expires: null,
    },
  ]);
  expect(
    (await h.db.query("SELECT id FROM decisions WHERE account_id='gmail-a'"))
      .rows,
  ).toEqual([{ id: "d-a" }]);
  expect(
    (await h.db.query("SELECT id FROM sender_rules WHERE account_id='gmail-a'"))
      .rows,
  ).toEqual([{ id: "r-a" }]);
  await connectIdentity(
    { sub: "gmail-a", email: "a@example.com" },
    undefined,
    "a",
    new Date(),
    false,
    { id: "ca-new", userId: "sotto-private-new" },
  );
  expect(
    (await h.db.query("SELECT connection_id FROM composio_cleanup")).rows,
  ).toEqual([{ connection_id: "ca-a" }]);
});

it("routes signed Composio events by connection and owner, retries queue failure and ignores paused or deleted accounts", async () => {
  vi.stubEnv("COMPOSIO_WEBHOOK_SECRET", "synthetic-signing-secret");
  vi.stubEnv("COMPOSIO_AUTH_CONFIG_ID", "ac-pilot");
  await h.db.query(
    "UPDATE accounts SET mail_provider='composio',composio_account_id='ca-a',composio_user_id='owner-a' WHERE id='gmail-a'",
  );
  const push = (user = "owner-a", config = "ac-pilot") => {
    const raw = JSON.stringify({
      type: "composio.trigger.message",
      metadata: {
        trigger_slug: "GMAIL_NEW_GMAIL_MESSAGE",
        connected_account_id: "ca-a",
        user_id: user,
        auth_config_id: config,
      },
      data: { body: "never store this" },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = createHmac("sha256", "synthetic-signing-secret")
      .update(`delivery.${timestamp}.${raw}`)
      .digest("base64");
    return new Request("https://sotto.example/api/composio/events", {
      method: "POST",
      body: raw,
      headers: {
        "webhook-id": "delivery",
        "webhook-timestamp": timestamp,
        "webhook-signature": `v1,${signature}`,
      },
    });
  };
  expect((await composioEvent(push("owner-b"))).status).toBe(204);
  expect((await composioEvent(push("owner-a", "ac-foreign"))).status).toBe(204);
  expect(h.enqueue).not.toHaveBeenCalled();
  h.enqueue.mockRejectedValueOnce(new Error("Queue temporarily unavailable"));
  expect((await composioEvent(push())).status).toBe(503);
  expect((await composioEvent(push())).status).toBe(204);
  expect(h.enqueue.mock.calls).toEqual([
    ["gmail-a", "composio:delivery"],
    ["gmail-a", "composio:delivery"],
  ]);
  expect(
    (await h.db.query("SELECT id,account_id,history_id FROM mailbox_events"))
      .rows,
  ).toEqual([
    { id: "composio:delivery", account_id: "gmail-a", history_id: "0" },
  ]);
  h.enqueue.mockClear();
  await h.db.query("UPDATE accounts SET mode='paused' WHERE id='gmail-a'");
  expect((await composioEvent(push())).status).toBe(204);
  expect(h.enqueue).not.toHaveBeenCalled();
  h.gmail.mockRejectedValue(new Error("Provider unavailable"));
  expect((await action(request(deletion))).status).toBe(200);
  expect((await composioEvent(push())).status).toBe(204);
  expect(h.enqueue).not.toHaveBeenCalled();
  expect((await h.db.query("SELECT id FROM mailbox_events")).rows).toEqual([]);
  expect(
    (await h.db.query("SELECT connection_id FROM composio_cleanup")).rows,
  ).toEqual([{ connection_id: "ca-a" }]);
});

it("disconnects Composio locally while retaining retryable revocation if the provider fails", async () => {
  await h.db.query(
    "UPDATE accounts SET mail_provider='composio',composio_account_id='ca-a',composio_user_id='owner-a',composio_trigger_id='ti-a' WHERE id='gmail-a'",
  );
  h.gmail.mockResolvedValue({
    stop: vi.fn().mockRejectedValue(new Error("offline")),
    revoke: vi.fn().mockRejectedValue(new Error("offline")),
  });
  expect(
    (await action(request({ action: "disconnect", accountId: "gmail-a" })))
      .status,
  ).toBe(200);
  expect(
    (
      await h.db.query(
        "SELECT connected,composio_account_id,composio_user_id,composio_trigger_id FROM accounts WHERE id='gmail-a'",
      )
    ).rows,
  ).toEqual([
    {
      connected: false,
      composio_account_id: null,
      composio_user_id: null,
      composio_trigger_id: null,
    },
  ]);
  expect(
    (await h.db.query("SELECT connection_id FROM composio_cleanup")).rows,
  ).toEqual([{ connection_id: "ca-a" }]);
  expect(
    (await h.db.query("SELECT id FROM decisions WHERE account_id='gmail-a'"))
      .rows,
  ).toEqual([{ id: "d-a" }]);
});

it("allows the internal pilot to link a third account while retaining workspace isolation", async () => {
  await h.db.query("UPDATE workspaces SET internal=true WHERE id='a'");
  await connectIdentity(
    { sub: "second-a", email: "second@example.com" },
    undefined,
    "a",
    new Date(),
    false,
    { id: "ca-second", userId: "owner-second" },
  );
  await connectIdentity(
    { sub: "third-a", email: "third@example.com" },
    undefined,
    "a",
    new Date(),
    false,
    { id: "ca-third", userId: "owner-third" },
  );
  expect(
    (
      await h.db.query(
        "SELECT count(*)::int AS n FROM accounts WHERE workspace_id='a' AND connected=true",
      )
    ).rows,
  ).toEqual([{ n: 3 }]);
  await expect(
    connectIdentity(
      { sub: "gmail-b", email: "b@example.com" },
      undefined,
      "a",
      new Date(),
      false,
      { id: "ca-foreign", userId: "owner-foreign" },
    ),
  ).rejects.toMatchObject({ code: "workspace_conflict", status: 409 });
});
