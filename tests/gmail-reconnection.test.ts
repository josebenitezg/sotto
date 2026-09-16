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
const h = vi.hoisted(() => ({ db: null as unknown as PGlite, fetch: vi.fn() }));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "device-a" }) }),
}));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, params: unknown[] = []) =>
    (await h.db.query(sql, params)).rows,
  transaction: async (fn: any) =>
    h.db.transaction((tx) =>
      fn({
        query: (sql: string, params: unknown[] = []) =>
          sql.includes("pg_advisory_xact_lock")
            ? Promise.resolve({ rows: [] })
            : tx.query(sql, params),
      }),
    ),
  // Embedded PostgreSQL exercises the real SQL, but cannot simulate lock contention.
  pool: () => ({
    connect: async () => ({
      query: async () => ({ rows: [{ acquired: true }] }),
      release() {},
    }),
  }),
}));
import { Gmail, GmailError } from "../src/lib/server/google";
import { hash } from "../src/lib/server/crypto";
import { enableDesktop } from "../src/lib/server/desktop-work";
import { connectIdentity } from "../src/lib/server/workspaces";
import { GMAIL_RECONNECT_MESSAGE } from "../src/lib/gmail-connection";
import { POST as service } from "../src/app/api/desktop/service/route";
const connection = { id: "ca_old", userId: "owner" };
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status });
const request = (body: unknown) =>
  new Request("https://sotto.example/api/desktop/service", {
    method: "POST",
    headers: {
      origin: "https://sotto.example",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
beforeAll(async () => {
  h.db = new PGlite();
  for (const f of (await readdir("db"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await h.db.exec(await readFile(`db/${f}`, "utf8"));
});
afterAll(() => h.db.close());
beforeEach(async () => {
  h.fetch.mockReset();
  vi.stubGlobal("fetch", h.fetch);
  for (const [k, v] of Object.entries({
    DESKTOP_ENABLED: "true",
    APP_URL: "https://sotto.example",
    BILLING_ENABLED: "true",
    DEMO_MODE: "false",
    ENABLE_MAILBOX_WRITES: "true",
    COMPOSIO_API_KEY: "synthetic",
    COMPOSIO_AUTH_CONFIG_ID: "synthetic",
    COMPOSIO_WEBHOOK_SECRET: "synthetic",
    GMAIL_PROVIDER: "composio",
    DATABASE_URL: "synthetic",
    ENCRYPTION_KEY: "11".repeat(32),
    ALLOWED_GOOGLE_EMAILS: "owner@example.com",
    OPENAI_API_KEY: "synthetic",
  }))
    vi.stubEnv(k, v);
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", undefined);
  await h.db.exec("TRUNCATE workspaces CASCADE");
  await h.db.exec(
    "INSERT INTO workspaces(id,email,internal) VALUES('a','owner@example.com',true),('b','other@example.com',true)",
  );
  await h.db.query(
    "INSERT INTO sessions(token_hash,workspace_id,expires_at) VALUES($1,'a',now()+interval '1 day')",
    [hash("device-a")],
  );
  await h.db.exec(
    "INSERT INTO accounts(id,email,name,token_cipher,workspace_id,mail_provider,composio_account_id,composio_user_id,history_id) VALUES('mail-a','owner@example.com','Owner','','a','composio','ca_old','owner','100'),('mail-b','other@example.com','Other','','b','composio','ca_other','other','100')",
  );
  h.fetch.mockImplementation(async (url: string) =>
    url.includes("/connected_accounts/")
      ? json({
          id: "ca_old",
          status: "EXPIRED",
          statusReason: "private provider detail",
        })
      : json({ error: "private provider detail" }, 410),
  );
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

it("turns confirmed expiry into an actionable 409, keeps the Sotto session and stops polling only that mailbox", async () => {
  await enableDesktop("a", hash("device-a"), "mail-a", "automatic");
  const response = await service(
    request({ action: "claim", accountId: "mail-a" }),
  );
  expect(response.status).toBe(409);
  expect(await response.json()).toEqual({ error: GMAIL_RECONNECT_MESSAGE });
  expect(
    (await h.db.query("SELECT id,connected FROM accounts ORDER BY id")).rows,
  ).toEqual([
    { id: "mail-a", connected: false },
    { id: "mail-b", connected: true },
  ]);
  const overview = await service(request({ action: "overview" }));
  expect(overview.status).toBe(200);
  const data = await overview.json();
  expect(data.localAccounts).toEqual([]);
  expect(data.dashboard.accounts).toHaveLength(1);
  expect(data.dashboard.accounts[0]).toMatchObject({
    connected: false,
    reconnectRequired: true,
    writesEnabled: false,
    mode: "automatic",
    policy: { processingLocation: "desktop" },
  });
  const calls = h.fetch.mock.calls.length;
  expect(
    (await service(request({ action: "claim", accountId: "mail-a" }))).status,
  ).toBe(409);
  expect(h.fetch).toHaveBeenCalledTimes(calls);
});

it("preserves a queued message and its retry budget when Gmail expires during retrieval", async () => {
  await enableDesktop("a", hash("device-a"), "mail-a", "review");
  await h.db.exec(
    "UPDATE accounts SET last_sync=now() WHERE id='mail-a'; INSERT INTO jobs(account_id,message_id,attempts) VALUES('mail-a','m',7)",
  );
  expect(
    (await service(request({ action: "claim", accountId: "mail-a" }))).status,
  ).toBe(409);
  expect(
    (await h.db.query("SELECT state,attempts,last_error FROM jobs")).rows,
  ).toEqual([
    { state: "pending", attempts: 7, last_error: "gmail_reconnect_required" },
  ]);
  expect((await h.db.query("SELECT * FROM desktop_leases")).rows).toEqual([]);
});

it.each(["ACTIVE", "UNAVAILABLE"])(
  "does not disconnect on a 410 when connection status is %s",
  async (status) => {
    h.fetch.mockImplementation(async (url: string) =>
      url.includes("/connected_accounts/")
        ? status === "ACTIVE"
          ? json({ id: "ca_old", status })
          : json({}, 503)
        : json({}, 410),
    );
    await expect(
      new Gmail("", "mail-a", connection).request("profile"),
    ).rejects.toEqual(new GmailError(410));
    expect(
      (
        await h.db.query(
          "SELECT connected,last_error FROM accounts WHERE id='mail-a'",
        )
      ).rows[0],
    ).toMatchObject({ connected: true, last_error: null });
  },
);

it.each([429, 503])(
  "does not treat a transient HTTP %s as expired authorization",
  async (status) => {
    h.fetch.mockResolvedValue(json({}, status));
    await expect(
      new Gmail("", "mail-a", connection).request("profile"),
    ).rejects.toEqual(new GmailError(status));
    expect(h.fetch).toHaveBeenCalledTimes(1);
    expect(
      (await h.db.query("SELECT connected FROM accounts WHERE id='mail-a'"))
        .rows[0],
    ).toEqual({ connected: true });
  },
);

it("ignores a late failure from an old connection after a successful reconnect", async () => {
  h.fetch.mockImplementation(async (url: string) => {
    if (!url.includes("/connected_accounts/")) return json({}, 410);
    await h.db.exec(
      "UPDATE accounts SET composio_account_id='ca_new' WHERE id='mail-a'",
    );
    return json({ id: "ca_old", status: "EXPIRED" });
  });
  await expect(
    new Gmail("", "mail-a", connection).request("profile"),
  ).rejects.toEqual(new GmailError(410));
  expect(
    (
      await h.db.query(
        "SELECT connected,last_error,composio_account_id FROM accounts WHERE id='mail-a'",
      )
    ).rows[0],
  ).toEqual({
    connected: true,
    last_error: null,
    composio_account_id: "ca_new",
  });
});

it("detects expiry during notification renewal as well as Gmail reads", async () => {
  await expect(
    new Gmail("", "mail-a", connection).ensureNotifications(),
  ).rejects.toMatchObject({ status: 409, message: GMAIL_RECONNECT_MESSAGE });
  expect(
    (await h.db.query("SELECT connected FROM accounts WHERE id='mail-a'"))
      .rows[0],
  ).toEqual({ connected: false });
});

it.each(["review", "automatic", "paused"])(
  "reconnects without changing the prior %s mode, local assignment or scan boundary",
  async (mode) => {
    await enableDesktop("a", hash("device-a"), "mail-a", mode);
    const before = (
      await h.db.query(
        "SELECT mode,policy,auto_after,history_id FROM accounts WHERE id='mail-a'",
      )
    ).rows[0];
    await h.db.query(
      "UPDATE accounts SET connected=false,last_error=$1 WHERE id='mail-a'",
      [GMAIL_RECONNECT_MESSAGE],
    );
    await connectIdentity(
      { sub: "mail-a", email: "owner@example.com" },
      undefined,
      "a",
      new Date(),
      true,
      { id: "ca_new", userId: "owner-new" },
    );
    expect(
      (
        await h.db.query(
          "SELECT mode,policy,auto_after,history_id FROM accounts WHERE id='mail-a'",
        )
      ).rows[0],
    ).toEqual(before);
    const overview = await (
      await service(request({ action: "overview" }))
    ).json();
    expect(overview.localAccounts).toHaveLength(1);
    expect(overview.dashboard.accounts[0]).toMatchObject({
      connected: true,
      reconnectRequired: false,
      lastError: null,
    });
  },
);
