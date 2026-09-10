import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  query: vi.fn(),
  work: vi.fn(),
}));
vi.mock("@vercel/queue", () => ({
  send: mocks.send,
  handleCallback: (handler: unknown) => handler,
}));
vi.mock("../src/lib/server/db", () => ({ query: mocks.query }));
vi.mock("../src/lib/server/engine", () => ({ workAccount: mocks.work }));
import { consumeMailbox as consume } from "../src/lib/server/cloud-worker";
import { GET } from "../src/app/api/cron/reconcile/route";
beforeEach(() => {
  vi.stubEnv("QUEUE_DRIVER", "vercel");
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("CRON_SECRET", "test-only-secret");
  mocks.send.mockReset().mockResolvedValue({ messageId: "next" });
  mocks.query.mockReset();
  mocks.work.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
it("processes bounded batches and durably schedules delayed pending work", async () => {
  mocks.query
    .mockResolvedValueOnce([{ id: "work" }])
    .mockResolvedValueOnce([{ next_at: new Date(Date.now() + 120000) }]);
  await consume({ accountId: "work" }, { messageId: "queue-1" });
  expect(mocks.work).toHaveBeenCalledWith("work", 3);
  const [topic, body, options] = mocks.send.mock.calls[0];
  expect(topic).toBe("sotto-mailboxes");
  expect(body).toEqual({ accountId: "work" });
  expect(options.delaySeconds).toBeGreaterThan(100);
  expect(options.idempotencyKey).toHaveLength(64);
});
it("does not continue a disconnected or paused account", async () => {
  mocks.query.mockResolvedValue([]);
  await consume({ accountId: "work" }, { messageId: "queue-1" });
  expect(mocks.work).not.toHaveBeenCalled();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("retries the parent delivery if scheduling the remaining work fails", async () => {
  mocks.query
    .mockResolvedValueOnce([{ id: "work" }])
    .mockResolvedValueOnce([{ next_at: new Date() }]);
  mocks.send.mockRejectedValue(new Error("Queue unavailable"));
  await expect(
    consume({ accountId: "work" }, { messageId: "queue-1" }),
  ).rejects.toThrow("Queue unavailable");
});
it("does not acknowledge a locked or failed account run", async () => {
  mocks.query.mockResolvedValueOnce([{ id: "work" }]);
  mocks.work.mockRejectedValue(new Error("Account busy"));
  await expect(
    consume({ accountId: "work" }, { messageId: "queue-1" }),
  ).rejects.toThrow("Account busy");
});
it("rejects unauthenticated daily recovery before database access", async () => {
  expect(
    (await GET(new Request("https://sotto.example/api/cron/reconcile"))).status,
  ).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("daily recovery enqueues every connected account and only purges expired operational records", async () => {
  mocks.query
    .mockResolvedValueOnce([{ id: "work" }, { id: "personal" }])
    .mockResolvedValue([]);
  const response = await GET(
    new Request("https://sotto.example/api/cron/reconcile", {
      headers: { authorization: "Bearer test-only-secret" },
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.send).toHaveBeenCalledTimes(2);
  expect(
    mocks.query.mock.calls
      .slice(1)
      .every(([sql]) => !sql.includes("DELETE FROM decisions")),
  ).toBe(true);
});
