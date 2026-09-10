import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeEach, afterEach, describe, it, expect, vi } from "vitest";
import type { Gmail } from "../src/lib/server/google";
import { GmailError } from "../src/lib/server/google";
const harness = vi.hoisted(() => ({ db: null as unknown as PGlite }));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, params: unknown[] = []) =>
    (await harness.db.query(sql, params)).rows,
  transaction: async (
    fn: (client: {
      query: (sql: string, params?: unknown[]) => Promise<unknown>;
    }) => Promise<unknown>,
  ) =>
    harness.db.transaction((tx) =>
      fn({ query: (sql, params = []) => tx.query(sql, params) }),
    ),
  pool: () => {
    throw new Error(
      "Advisory locks require PostgreSQL; not exercised by this embedded SQL harness",
    );
  },
}));
import {
  historyCandidates,
  syncMailbox,
  moveDecision,
  restoreDecision,
} from "../src/lib/server/engine";
beforeEach(async () => {
  harness.db = new PGlite();
  await harness.db.exec(
    await readFile(new URL("../db/001_initial.sql", import.meta.url), "utf8"),
  );
  await harness.db.query(
    "INSERT INTO accounts(id,email,name,token_cipher,history_id) VALUES('work','owner@studio.example','Work','test','100'),('personal','owner@gmail.example','Personal','test','200')",
  );
  vi.stubEnv("ENABLE_MAILBOX_WRITES", "true");
  vi.stubEnv("DEMO_MODE", "false");
});
afterEach(async () => {
  await harness.db.close();
  vi.unstubAllEnvs();
});
describe("durable mailbox synchronization", () => {
  it("deduplicates changes including manual Inbox additions", () => {
    expect(
      historyCandidates([
        {
          messagesAdded: [{ message: { id: "a" } }, { message: { id: "a" } }],
          labelsAdded: [
            { message: { id: "b" }, labelIds: ["INBOX"] },
            { message: { id: "c" }, labelIds: ["UNREAD"] },
          ],
        },
      ]),
    ).toEqual(["a", "b"]);
  });
  it("processes all pages with the original cursor and isolates accounts", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        historyId: "150",
        nextPageToken: "page2",
        history: [{ messagesAdded: [{ message: { id: "one" } }] }],
      })
      .mockResolvedValueOnce({
        historyId: "160",
        history: [
          {
            messagesAdded: [
              { message: { id: "one" } },
              { message: { id: "two" } },
            ],
          },
        ],
      });
    await syncMailbox("work", { request } as unknown as Gmail);
    expect(request.mock.calls[1][0]).toContain("startHistoryId=100");
    expect(
      (
        await harness.db.query(
          "SELECT message_id FROM jobs ORDER BY message_id",
        )
      ).rows,
    ).toEqual([{ message_id: "one" }, { message_id: "two" }]);
    expect(
      (await harness.db.query("SELECT id,history_id FROM accounts ORDER BY id"))
        .rows,
    ).toEqual([
      { id: "personal", history_id: "200" },
      { id: "work", history_id: "160" },
    ]);
    request.mockResolvedValue({
      historyId: "160",
      history: [{ messagesAdded: [{ message: { id: "one" } }] }],
    });
    await syncMailbox("work", { request } as unknown as Gmail);
    expect(
      (await harness.db.query("SELECT count(*)::int AS n FROM jobs")).rows,
    ).toEqual([{ n: 2 }]);
  });
  it("does not advance the cursor when a later page fails", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        historyId: "150",
        nextPageToken: "p2",
        history: [{ messagesAdded: [{ message: { id: "one" } }] }],
      })
      .mockRejectedValueOnce(new GmailError(503));
    await expect(
      syncMailbox("work", { request } as unknown as Gmail),
    ).rejects.toThrow();
    expect(
      (
        await harness.db.query(
          "SELECT history_id FROM accounts WHERE id='work'",
        )
      ).rows,
    ).toEqual([{ history_id: "100" }]);
    expect(
      (await harness.db.query("SELECT count(*)::int AS n FROM jobs")).rows,
    ).toEqual([{ n: 0 }]);
  });
  it("recovers an expired history cursor with a bounded inbox scan", async () => {
    const request = vi
      .fn()
      .mockRejectedValueOnce(new GmailError(404))
      .mockResolvedValueOnce({ historyId: "900" })
      .mockResolvedValueOnce({ messages: [{ id: "recent" }] });
    await syncMailbox("work", { request } as unknown as Gmail);
    expect(decodeURIComponent(request.mock.calls[2][0])).toContain(
      "in:inbox+after:",
    );
    expect(
      (
        await harness.db.query(
          "SELECT history_id FROM accounts WHERE id='work'",
        )
      ).rows,
    ).toEqual([{ history_id: "900" }]);
  });
});
describe("reversible message-level operations", () => {
  async function setup() {
    await harness.db.query(
      "INSERT INTO decisions(id,account_id,message_id,thread_id,sender,subject,category,confidence,reason,state) VALUES('d','work','m','t','sales@vendor.example','Pitch','cold',0.99,'Sales','suggested')",
    );
    let labels = ["INBOX", "UNREAD"];
    const gmail = {
      message: vi.fn(async () => ({
        id: "m",
        threadId: "t",
        from: "sales@vendor.example",
        subject: "Pitch",
        text: "Sales",
        labels: [...labels],
        receivedAt: Date.now(),
        headers: {
          "authentication-results":
            "mx.google.com; dmarc=pass header.from=vendor.example",
        },
      })),
      threadHasReply: vi.fn(async () => false),
      hasWrittenTo: vi.fn(async () => false),
      ensureLabel: vi.fn(async () => "Label_Cold"),
      modify: vi.fn(async (_id: string, add: string[], remove: string[]) => {
        labels = [
          ...new Set([...labels.filter((l) => !remove.includes(l)), ...add]),
        ];
      }),
    };
    return { gmail, getLabels: () => labels };
  }
  it("moves once and restores only its label changes, preserving UNREAD", async () => {
    const { gmail, getLabels } = await setup();
    await moveDecision("d", gmail as unknown as Gmail);
    await moveDecision("d", gmail as unknown as Gmail);
    expect(gmail.modify).toHaveBeenCalledTimes(1);
    expect(getLabels()).toEqual(["UNREAD", "Label_Cold"]);
    await restoreDecision("d", gmail as unknown as Gmail);
    expect(getLabels()).toEqual(["UNREAD", "INBOX"]);
    expect(
      (await harness.db.query("SELECT state FROM decisions WHERE id='d'")).rows,
    ).toEqual([{ state: "restored" }]);
  });
  it("rechecks a sender rule added after classification", async () => {
    const { gmail } = await setup();
    await harness.db.query(
      "INSERT INTO sender_rules(id,account_id,sender) VALUES('r','work','sales@vendor.example')",
    );
    await moveDecision("d", gmail as unknown as Gmail);
    expect(gmail.modify).not.toHaveBeenCalled();
    expect(
      (await harness.db.query("SELECT state FROM decisions WHERE id='d'")).rows,
    ).toEqual([{ state: "kept" }]);
  });
  it("recovers a Gmail write that succeeded before the database update", async () => {
    const { gmail } = await setup();
    await moveDecision("d", gmail as unknown as Gmail);
    await harness.db.query("UPDATE decisions SET state='moving' WHERE id='d'");
    await moveDecision("d", gmail as unknown as Gmail);
    expect(gmail.modify).toHaveBeenCalledTimes(1);
    expect(
      (await harness.db.query("SELECT state FROM decisions WHERE id='d'")).rows,
    ).toEqual([{ state: "moved" }]);
  });
  it("does not mutate Gmail when the global write gate is off", async () => {
    const { gmail } = await setup();
    vi.stubEnv("ENABLE_MAILBOX_WRITES", "false");
    await expect(moveDecision("d", gmail as unknown as Gmail)).rejects.toThrow(
      "disabled",
    );
    expect(gmail.modify).not.toHaveBeenCalled();
  });
});
