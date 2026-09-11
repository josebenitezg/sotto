import { beforeEach, afterEach, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({
  query: vi.fn(),
  allowed: vi.fn(),
  allowance: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("../src/lib/server/db", () => ({ query: h.query }));
vi.mock("../src/lib/server/entitlements", () => ({
  accountProcessingAllowed: h.allowed,
}));
vi.mock("../src/lib/server/allowances", () => ({
  accountAllowance: h.allowance,
}));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: h.enqueue }));
import { GET } from "../src/app/api/cron/poll/route";
beforeEach(() => {
  vi.stubEnv("BILLING_ENABLED", "true");
  vi.stubEnv("COMPOSIO_NOTIFICATION_MODE", "poll");
  vi.stubEnv("QUEUE_DRIVER", "vercel");
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("CRON_SECRET", "synthetic");
  vi.resetAllMocks();
});
afterEach(() => vi.unstubAllEnvs());
const request = () =>
  new Request("https://sotto.example/api/cron/poll", {
    headers: { authorization: "Bearer synthetic" },
  });
it("requires authentication and the configured polling mode before reading accounts", async () => {
  expect(
    (await GET(new Request("https://sotto.example/api/cron/poll"))).status,
  ).toBe(401);
  vi.stubEnv("COMPOSIO_NOTIFICATION_MODE", "trigger");
  expect((await GET(request())).status).toBe(404);
  expect(h.query).not.toHaveBeenCalled();
});
it("only queues entitled accounts with remaining allowance and deduplicates the scheduled interval", async () => {
  h.query.mockResolvedValue([
    { id: "active" },
    { id: "unpaid" },
    { id: "used" },
  ]);
  h.allowed.mockImplementation(async (id: string) => id !== "unpaid");
  h.allowance.mockImplementation(async (id: string) => ({
    exhausted: id === "used",
  }));
  vi.spyOn(Date, "now").mockReturnValue(1800000 * 100 + 500);
  try {
    expect(await (await GET(request())).json()).toEqual({ queued: 1 });
    await GET(request());
    expect(h.enqueue.mock.calls).toEqual([
      ["active", "poll:active:100"],
      ["active", "poll:active:100"],
    ]);
    expect(h.query.mock.calls[0][0]).toContain("w.internal=false");
  } finally {
    vi.restoreAllMocks();
  }
});
it("reports a queue failure so the scheduled run can be retried", async () => {
  h.query.mockResolvedValue([{ id: "active" }]);
  h.allowed.mockResolvedValue(true);
  h.allowance.mockResolvedValue({ exhausted: false });
  h.enqueue.mockRejectedValue(new Error("queue unavailable"));
  await expect(GET(request())).rejects.toThrow("queue unavailable");
});
