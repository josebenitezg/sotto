import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  db: null as unknown as PGlite,
  classify: vi.fn(),
  gmail: vi.fn(),
}));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, params: unknown[] = []) =>
    (await h.db.query(sql, params)).rows,
  transaction: async (fn: (client: any) => Promise<unknown>) =>
    h.db.transaction((tx) =>
      fn({
        query: (sql: string, params: unknown[] = []) => tx.query(sql, params),
      }),
    ),
  pool: () => ({
    connect: async () => ({
      query: async (sql: string) => ({
        rows: sql.includes("pg_try_advisory_lock") ? [{ acquired: true }] : [],
      }),
      release: () => {},
    }),
  }),
}));
vi.mock("../src/lib/server/google", async (original) => ({
  ...(await original<object>()),
  Gmail: { forAccount: h.gmail },
}));
vi.mock("../src/lib/server/classifier", async (original) => ({
  ...(await original<object>()),
  classify: h.classify,
}));
import { workAccount } from "../src/lib/server/engine";
import { ClassifierRateLimit } from "../src/lib/server/processing-error";

it("stops the batch on a provider limit and defers the whole mailbox without touching another account", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  vi.stubEnv("GOOGLE_PUBSUB_TOPIC", "");
  h.db = new PGlite();
  try {
    await h.db.exec(
      await readFile(new URL("../db/001_initial.sql", import.meta.url), "utf8"),
    );
    await h.db
      .exec(`INSERT INTO accounts(id,email,name,token_cipher,history_id) VALUES
      ('work','owner@studio.example','Work','test','100'),('other','other@gmail.example','Other','test','100');
      INSERT INTO jobs(account_id,message_id,attempts) VALUES('work','one',8),('work','two',0),('other','other',0);`);
    const message = vi
      .fn()
      .mockResolvedValue({
        id: "one",
        threadId: "thread",
        from: "sales@vendor.example",
        subject: "Pitch",
        labels: ["INBOX"],
        text: "Synthetic",
        headers: {},
        receivedAt: Date.now(),
      });
    h.gmail.mockResolvedValue({
      request: async () => ({ historyId: "101", history: [] }),
      message,
      threadHasReply: async () => false,
      hasWrittenTo: async () => false,
    });
    h.classify.mockRejectedValue(new ClassifierRateLimit(180));
    await workAccount("work", 3);
    expect(message).toHaveBeenCalledTimes(1);
    expect(h.classify).toHaveBeenCalledTimes(1);
    const rows = (
      await h.db.query(`SELECT account_id,message_id,state,attempts,last_error,
      available_at > now()+interval '170 seconds' AS deferred FROM jobs ORDER BY account_id,message_id`)
    ).rows;
    expect(rows).toEqual([
      {
        account_id: "other",
        message_id: "other",
        state: "pending",
        attempts: 0,
        last_error: null,
        deferred: false,
      },
      {
        account_id: "work",
        message_id: "one",
        state: "pending",
        attempts: 9,
        last_error: "classifier_http_429",
        deferred: true,
      },
      {
        account_id: "work",
        message_id: "two",
        state: "pending",
        attempts: 0,
        last_error: null,
        deferred: true,
      },
    ]);
    expect(
      (await h.db.query("SELECT count(*)::int AS n FROM decisions")).rows,
    ).toEqual([{ n: 0 }]);
  } finally {
    await h.db.close();
    vi.unstubAllEnvs();
  }
});
