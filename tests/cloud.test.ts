import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  query: vi.fn(),
  work: vi.fn(),
  allowance: vi.fn(),
}));
vi.mock("@vercel/queue", () => ({
  send: mocks.send,
  handleCallback: (handler: unknown) => handler,
}));
vi.mock("../src/lib/server/db", () => ({ query: mocks.query }));
vi.mock("../src/lib/server/allowances", () => ({
  accountAllowance: mocks.allowance,
}));
vi.mock("../src/lib/server/engine", () => ({
  workAccount: mocks.work,
  AccountBusy: class extends Error {},
}));
import { AccountBusy } from "../src/lib/server/engine";
import { consumeMailbox as consume } from "../src/lib/server/cloud-worker";
import { GET } from "../src/app/api/cron/reconcile/route";
beforeEach(() => {
  vi.stubEnv("QUEUE_DRIVER", "vercel");
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("CRON_SECRET", "test-only-secret");
  mocks.send.mockReset().mockResolvedValue({ messageId: "next" });
  mocks.query.mockReset();
  mocks.work.mockReset();
  mocks.allowance.mockReset().mockResolvedValue(null);
});
it("does not keep scheduling unreserved work or scan pages after quota is exhausted", async () => {
  mocks.allowance.mockResolvedValue({ exhausted: true });
  mocks.query
    .mockResolvedValueOnce([{ id: "work" }])
    .mockResolvedValueOnce([{ next_at: null, scan_pending: true }]);
  await consume({ accountId: "work" }, { messageId: "quota" });
  expect(mocks.query.mock.calls[1][1]).toEqual(["work", false]);
  expect(mocks.send).not.toHaveBeenCalled();
});
it("continues a stored scan page when allowance remains", async () => {
  mocks.allowance.mockResolvedValue({ exhausted: false });
  mocks.query
    .mockResolvedValueOnce([{ id: "work" }])
    .mockResolvedValueOnce([{ next_at: null, scan_pending: true }]);
  await consume({ accountId: "work" }, { messageId: "page" });
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][2]).toMatchObject({ delaySeconds: 1 });
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
it("does not acknowledge a failed account run", async () => {
  mocks.query.mockResolvedValueOnce([{ id: "work" }]);
  mocks.work.mockRejectedValue(new Error("Account busy"));
  await expect(
    consume({ accountId: "work" }, { messageId: "queue-1" }),
  ).rejects.toThrow("Account busy");
});
it("releases a busy delivery only after durably scheduling its retry", async () => {
  mocks.query.mockResolvedValue([{ id: "work" }]);
  mocks.work.mockRejectedValue(new AccountBusy());
  await consume({ accountId: "work" }, { messageId: "queue-busy" });
  expect(mocks.send).toHaveBeenCalledTimes(1);
  expect(mocks.send.mock.calls[0][1]).toEqual({ accountId: "work" });
  expect(mocks.send.mock.calls[0][2]).toMatchObject({ delaySeconds: 15 });
  expect(mocks.query).toHaveBeenCalledTimes(1);
  mocks.send.mockRejectedValue(new Error("Queue unavailable"));
  await expect(
    consume({ accountId: "work" }, { messageId: "queue-busy" }),
  ).rejects.toThrow("Queue unavailable");
});
it("rejects unauthenticated daily recovery before database access", async () => {
  expect(
    (await GET(new Request("https://sotto.example/api/cron/reconcile"))).status,
  ).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("allows an authenticated deployment-origin queue probe without mailbox access", async () => {
  const response = await GET(
    new Request("https://sotto.example/api/cron/reconcile?probe=queue", {
      headers: { authorization: "Bearer test-only-secret" },
    }),
  );
  expect(response.status).toBe(200);
  expect(mocks.send.mock.calls[0][1]).toEqual({
    accountId: "sotto-installation-probe",
  });
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
