import { beforeEach, afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  verify: vi.fn(),
  query: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("google-auth-library", () => ({
  OAuth2Client: class {
    verifyIdToken = mocks.verify;
  },
}));
vi.mock("../src/lib/server/db", () => ({ query: mocks.query }));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: mocks.enqueue }));
import { POST } from "../src/app/api/gmail/events/route";
function request(
  headers = { authorization: "Bearer test-token" },
  body = JSON.stringify({
    message: {
      messageId: "pubsub-1",
      data: Buffer.from(
        JSON.stringify({
          emailAddress: "owner@studio.example",
          historyId: "90071992547409999",
        }),
      ).toString("base64"),
    },
  }),
) {
  return new Request("https://sotto.example/api/gmail/events", {
    method: "POST",
    headers,
    body,
  });
}
function historyRequest(historyId: unknown) {
  return request(
    undefined,
    JSON.stringify({
      message: {
        messageId: "pubsub-numeric",
        data: Buffer.from(
          JSON.stringify({ emailAddress: "owner@studio.example", historyId }),
        ).toString("base64"),
      },
    }),
  );
}
beforeEach(() => {
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("PUBSUB_AUDIENCE", "https://sotto.example/api/gmail/events");
  vi.stubEnv(
    "PUBSUB_SERVICE_ACCOUNT_EMAIL",
    "push@project.iam.gserviceaccount.com",
  );
  mocks.verify.mockReset();
  mocks.enqueue.mockReset().mockResolvedValue(undefined);
  mocks.query.mockReset();
  mocks.verify.mockResolvedValue({
    getPayload: () => ({
      email: "push@project.iam.gserviceaccount.com",
      email_verified: true,
    }),
  });
  mocks.query.mockResolvedValueOnce([{ id: "work" }]).mockResolvedValue([]);
});
afterEach(() => vi.unstubAllEnvs());
it("rejects unsigned and invalid tokens before touching the database", async () => {
  expect((await POST(request({} as never))).status).toBe(401);
  mocks.verify.mockRejectedValue(new Error("Invalid JWT"));
  expect((await POST(request())).status).toBe(401);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("requires the exact verified push account", async () => {
  mocks.verify.mockResolvedValue({
    getPayload: () => ({
      email: "other@project.iam.gserviceaccount.com",
      email_verified: true,
    }),
  });
  expect((await POST(request())).status).toBe(403);
  expect(mocks.query).not.toHaveBeenCalled();
});
it("persists the event and exact string cursor before acknowledging", async () => {
  expect((await POST(request())).status).toBe(204);
  expect(mocks.verify).toHaveBeenCalledWith({
    idToken: "test-token",
    audience: "https://sotto.example/api/gmail/events",
  });
  expect(mocks.query.mock.calls[0][1]).toEqual([
    "pubsub-1",
    "owner@studio.example",
    "90071992547409999",
  ]);
});
it("accepts a numeric Gmail history ID and persists its exact decimal string", async () => {
  expect((await POST(historyRequest(9876543210))).status).toBe(204);
  expect(mocks.query.mock.calls[0][1]).toEqual([
    "pubsub-numeric",
    "owner@studio.example",
    "9876543210",
  ]);
  expect(mocks.enqueue).toHaveBeenCalledWith("work", "gmail:pubsub-numeric");
});
it.each([Number.MAX_SAFE_INTEGER + 1, 1.5, -1, true, null, "1e3"])(
  "rejects an invalid or imprecise history ID (%s) without writing",
  async (historyId) => {
    expect((await POST(historyRequest(historyId))).status).toBe(400);
    expect(mocks.query).not.toHaveBeenCalled();
    expect(mocks.enqueue).not.toHaveBeenCalled();
  },
);
it("does not acknowledge when durable storage fails", async () => {
  mocks.query
    .mockReset()
    .mockRejectedValueOnce(new Error("Database unavailable"));
  expect((await POST(request())).status).toBe(503);
});
it("rejects malformed payloads without writing", async () => {
  expect((await POST(request(undefined, "not-json"))).status).toBe(400);
  expect(mocks.query).not.toHaveBeenCalled();
});

it("does not acknowledge a durable event when queue publication fails", async () => {
  mocks.enqueue.mockRejectedValue(new Error("Queue unavailable"));
  expect((await POST(request())).status).toBe(503);
  expect(mocks.query.mock.calls[0][0]).toContain("INSERT INTO mailbox_events");
});
