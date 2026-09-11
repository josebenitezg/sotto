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
const h = vi.hoisted(() => ({ db: null as unknown as PGlite }));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, params: unknown[] = []) =>
    (await h.db.query(sql, params)).rows,
  transaction: async (fn: any) =>
    h.db.transaction((tx) =>
      fn({ query: (sql: string, p: unknown[] = []) => tx.query(sql, p) }),
    ),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
import {
  workspaceAllowance,
  reserveMessage,
  MailAllowanceReached,
} from "../src/lib/server/allowances";
import { syncMailbox } from "../src/lib/server/engine";
import type { Gmail } from "../src/lib/server/google";
beforeAll(async () => {
  h.db = new PGlite();
  for (const f of [
    "001_initial.sql",
    "002_billing.sql",
    "007_plans.sql",
    "008_mail_allowances.sql",
    "009_global_config.sql",
  ])
    await h.db.exec(
      await readFile(new URL(`../db/${f}`, import.meta.url), "utf8"),
    );
});
afterAll(() => h.db.close());
beforeEach(async () => {
  vi.stubEnv("BILLING_ENABLED", "true");
  await h.db.exec("TRUNCATE workspaces CASCADE");
  await h.db.exec(
    `INSERT INTO workspaces(id,email,billing_plan,subscription_status,trial_end,allowance_period,allowance_resets_at,allowance_trial) VALUES('a','a@example.com','solo','trialing',now()+interval '3 days','trial:1',now()+interval '3 days',true),('b','b@example.com','duo','trialing',now()+interval '3 days','trial:2',now()+interval '3 days',true); INSERT INTO accounts(id,email,name,token_cipher,workspace_id,mode,history_id) VALUES('mail-a','a@example.com','A','fake','a','automatic','100'),('mail-b','b@example.com','B','fake','b','automatic','200'),('mail-c','c@example.com','C','fake','b','automatic','300');`,
  );
});
afterEach(() => vi.unstubAllEnvs());
it("limits the trial, counts retries once, and isolates workspaces", async () => {
  for (let i = 0; i < 50; i++) await reserveMessage("mail-a", `m${i}`);
  await reserveMessage("mail-a", "m0");
  await expect(reserveMessage("mail-a", "extra")).rejects.toBeInstanceOf(
    MailAllowanceReached,
  );
  expect(await workspaceAllowance("a")).toMatchObject({
    used: 50,
    limit: 50,
    remaining: 0,
    exhausted: true,
  });
  expect(await workspaceAllowance("b")).toMatchObject({
    used: 0,
    limit: 100,
    remaining: 100,
  });
});
it("shares Duo allowance and reserves the final slot only once", async () => {
  await h.db.exec(`INSERT INTO usage_periods VALUES('b','trial:2',99)`);
  const results = await Promise.allSettled([
    reserveMessage("mail-b", "last"),
    reserveMessage("mail-c", "also-last"),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(await workspaceAllowance("b")).toMatchObject({
    used: 100,
    remaining: 0,
  });
});
it("does not reset usage when upgrading, downgrading or reconnecting", async () => {
  await h.db.exec(
    `UPDATE workspaces SET subscription_status='active',paid_until=now()+interval '1 month',allowance_trial=false,allowance_period='paid:1' WHERE id='a'; INSERT INTO usage_periods VALUES('a','paid:1',250)`,
  );
  expect((await workspaceAllowance("a"))?.remaining).toBe(0);
  await h.db.exec(`UPDATE workspaces SET billing_plan='duo' WHERE id='a'`);
  await reserveMessage("mail-a", "new");
  expect((await workspaceAllowance("a"))?.remaining).toBe(249);
  await h.db.exec(
    `UPDATE accounts SET connected=false WHERE id='mail-a'; UPDATE accounts SET connected=true WHERE id='mail-a'; UPDATE workspaces SET billing_plan='solo' WHERE id='a'`,
  );
  expect((await workspaceAllowance("a"))?.exhausted).toBe(true);
});
it("keeps the aggregate usage after Gmail data deletion and starts a new allowance only for a new period", async () => {
  await reserveMessage("mail-a", "one");
  await h.db.exec(`DELETE FROM accounts WHERE id='mail-a'`);
  expect((await workspaceAllowance("a"))?.used).toBe(1);
  expect(
    (await h.db.query("SELECT * FROM message_allowances")).rows,
  ).toHaveLength(0);
  await h.db.exec(
    `UPDATE workspaces SET subscription_status='active',paid_until=now()+interval '1 month',allowance_trial=false,allowance_period='paid:1' WHERE id='a'`,
  );
  expect(await workspaceAllowance("a")).toMatchObject({
    used: 0,
    limit: 250,
    remaining: 250,
  });
});
it("stops new work at expiry but leaves internal installations uncapped", async () => {
  await h.db.exec(
    `UPDATE workspaces SET trial_end=now()-interval '1 second' WHERE id='a'`,
  );
  await expect(reserveMessage("mail-a", "one")).rejects.toBeInstanceOf(
    MailAllowanceReached,
  );
  await h.db.exec(`UPDATE workspaces SET internal=true WHERE id='a'`);
  await reserveMessage("mail-a", "one");
  expect(await workspaceAllowance("a")).toBeNull();
});
it("persists scan pagination, drains queued mail before more reads, and stops reads at quota", async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce({
      historyId: "150",
      nextPageToken: "page2",
      history: [
        { messagesAdded: [{ message: { id: "one", labelIds: ["INBOX"] } }] },
      ],
    })
    .mockResolvedValueOnce({
      historyId: "160",
      history: [
        {
          messagesAdded: [
            { message: { id: "two", labelIds: ["INBOX"] } },
            { message: { id: "sent", labelIds: ["SENT"] } },
          ],
        },
      ],
    });
  const gmail = { request } as unknown as Gmail;
  await syncMailbox("mail-a", gmail);
  await syncMailbox("mail-a", gmail);
  expect(request).toHaveBeenCalledTimes(1);
  await h.db.exec(`UPDATE jobs SET state='done' WHERE account_id='mail-a'`);
  await syncMailbox("mail-a", gmail);
  expect(request.mock.calls[1][0]).toContain("startHistoryId=100");
  expect(request.mock.calls[1][0]).toContain("pageToken=page2");
  expect(
    (
      await h.db.query(
        `SELECT history_id,sync_page_token FROM accounts WHERE id='mail-a'`,
      )
    ).rows[0],
  ).toEqual({ history_id: "160", sync_page_token: null });
  expect(
    (await h.db.query(`SELECT message_id FROM jobs ORDER BY message_id`)).rows,
  ).toEqual([{ message_id: "one" }, { message_id: "two" }]);
  await h.db.exec(`INSERT INTO usage_periods VALUES('a','trial:1',50)`);
  await syncMailbox("mail-a", gmail);
  expect(request).toHaveBeenCalledTimes(2);
});
