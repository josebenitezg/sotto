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
    const message = vi.fn().mockResolvedValue({
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

it("automatically moves only the permitted account and keeps blocked recovery from stopping review work", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("GOOGLE_PUBSUB_TOPIC", "");
  vi.stubEnv("ENABLE_MAILBOX_WRITES", "true");
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", "demo");
  h.db = new PGlite();
  h.gmail.mockReset();
  h.classify.mockReset().mockResolvedValue({
    decision: "move",
    category: "cold",
    confidence: 0.9,
    protected: false,
    reason: "Synthetic pitch",
  });
  try {
    await h.db.exec(
      await readFile(new URL("../db/001_initial.sql", import.meta.url), "utf8"),
    );
    await h.db
      .exec(`INSERT INTO accounts(id,email,name,token_cipher,history_id,mode,auto_after) VALUES
      ('demo','demo@studio.example','Demo','test','100','automatic',now()-interval '1 hour'),
      ('pilot','pilot@studio.example','Pilot','test','100','automatic',now()-interval '1 hour');
      INSERT INTO jobs(account_id,message_id) VALUES('demo','demo-message'),('pilot','pilot-message');
      INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state)
      VALUES('old-pilot','pilot','old-message','old-thread','sales@vendor.example','Prior move','cold',0.9,'Pitch','restoring');`);
    const mailboxes = new Map(
      ["demo", "pilot"].map((accountId) => [
        accountId,
        {
          request: vi.fn(async () => ({ historyId: "101", history: [] })),
          message: vi.fn(async (id: string) => ({
            id,
            threadId: id,
            from: "sales@vendor.example",
            subject: "Synthetic pitch",
            text: "An unsolicited offer",
            labels: ["INBOX", "UNREAD"],
            receivedAt: Date.now(),
            headers: {
              "authentication-results":
                "mx.google.com; dmarc=pass header.from=vendor.example",
            },
          })),
          threadHasReply: vi.fn(async () => false),
          hasWrittenTo: vi.fn(async () => false),
          ensureLabel: vi.fn(async () => "Label_Cold"),
          modify: vi.fn(async () => ({})),
        },
      ]),
    );
    h.gmail.mockImplementation(async (id: string) => mailboxes.get(id));
    await workAccount("demo", 3);
    await workAccount("pilot", 3);
    expect(mailboxes.get("demo")!.modify).toHaveBeenCalledWith(
      "demo-message",
      ["Label_Cold"],
      ["INBOX"],
    );
    expect(mailboxes.get("pilot")!.modify).not.toHaveBeenCalled();
    expect(mailboxes.get("pilot")!.ensureLabel).not.toHaveBeenCalled();
    expect(mailboxes.get("pilot")!.message).toHaveBeenCalledExactlyOnceWith(
      "pilot-message",
    );
    expect(
      (
        await h.db.query(
          "SELECT account_id,state FROM decisions ORDER BY account_id,message_id",
        )
      ).rows,
    ).toEqual([
      { account_id: "demo", state: "moved" },
      { account_id: "pilot", state: "restoring" },
      { account_id: "pilot", state: "suggested" },
    ]);
    expect(
      (await h.db.query("SELECT state FROM jobs ORDER BY account_id")).rows,
    ).toEqual([{ state: "done" }, { state: "done" }]);
  } finally {
    await h.db.close();
    vi.unstubAllEnvs();
  }
});

it("filters recent existing suggestions and new mail, retries failed label creation, and never moves old, kept or restored mail", async () => {
  vi.stubEnv("BILLING_ENABLED", "false");
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("GOOGLE_PUBSUB_TOPIC", "");
  vi.stubEnv("ENABLE_MAILBOX_WRITES", "true");
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", "work");
  h.db = new PGlite();
  h.gmail.mockReset();
  h.classify
    .mockReset()
    .mockResolvedValue({
      decision: "move",
      category: "cold",
      confidence: 0.9,
      protected: false,
      reason: "Synthetic sales outreach",
    });
  try {
    await h.db.exec(
      await readFile(new URL("../db/001_initial.sql", import.meta.url), "utf8"),
    );
    await h.db
      .exec(`INSERT INTO accounts(id,email,name,token_cipher,history_id,mode,auto_after)
      VALUES('work','owner@studio.example','Work','synthetic','100','automatic',now()-interval '7 days');
      INSERT INTO jobs(account_id,message_id) VALUES('work','recent'),('work','old'),('work','kept'),('work','restored'),('work','new');`);
    for (const [id, state] of [
      ["recent", "suggested"],
      ["old", "suggested"],
      ["kept", "kept"],
      ["restored", "restored"],
    ])
      await h.db.query(
        `INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state,ai_decision)
        VALUES($1,'work',$1,$1,'sales@vendor.example','Synthetic pitch','cold',0.9,'Pitch',$2,'move')`,
        [id, state],
      );
    const modify = vi.fn(async () => ({}));
    const ensureLabel = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary label failure"))
      .mockResolvedValue("Label_Cold");
    const message = vi.fn(async (id: string) => ({
      id,
      threadId: id,
      from: "sales@vendor.example",
      subject: "Synthetic pitch",
      text: "Sales",
      labels: ["INBOX", "UNREAD"],
      receivedAt: Date.now() - (id === "old" ? 8 : 1) * 86400000,
      headers: {
        "authentication-results":
          "mx.google.com; dmarc=pass header.from=vendor.example",
      },
    }));
    h.gmail.mockResolvedValue({
      request: async () => ({ historyId: "101", history: [] }),
      message,
      modify,
      ensureLabel,
      threadHasReply: async () => false,
      hasWrittenTo: async () => false,
    });
    await workAccount("work", 10);
    expect(modify.mock.calls.map((c: any[]) => c[0])).toEqual(["new"]);
    expect(message.mock.calls.map((c) => c[0])).not.toContain("kept");
    expect(message.mock.calls.map((c) => c[0])).not.toContain("restored");
    await h.db.query(
      "UPDATE jobs SET available_at=now() WHERE message_id='recent'",
    );
    await workAccount("work", 10);
    expect(modify.mock.calls.map((c: any[]) => c[0])).toEqual([
      "new",
      "recent",
    ]);
    expect(modify).toHaveBeenCalledWith("recent", ["Label_Cold"], ["INBOX"]);
    expect(
      (
        await h.db.query(
          "SELECT id,state FROM decisions WHERE id IN ('old','kept','restored') ORDER BY id",
        )
      ).rows,
    ).toEqual([
      { id: "kept", state: "kept" },
      { id: "old", state: "suggested" },
      { id: "restored", state: "restored" },
    ]);
    expect(h.classify).toHaveBeenCalledOnce();
  } finally {
    await h.db.close();
    vi.unstubAllEnvs();
  }
});
