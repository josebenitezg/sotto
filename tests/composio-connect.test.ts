import { beforeEach, afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  workspace: null as string | null,
  pending: null as any,
  query: vi.fn(),
  complete: vi.fn(),
  identity: vi.fn(),
  remove: vi.fn(),
  connect: vi.fn(),
  enqueue: vi.fn(),
  session: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (h.cookie ? { value: h.cookie } : undefined),
  }),
}));
vi.mock("../src/lib/server/auth", () => ({
  cookieOptions: () => ({ httpOnly: true, secure: true, sameSite: "lax" }),
  sessionCookie: "sotto_session",
  createSession: h.session,
  sessionWorkspace: async () => h.workspace,
}));
vi.mock("../src/lib/server/db", () => ({ query: h.query }));
vi.mock("../src/lib/server/composio", () => ({
  composioCookie: "sotto_composio",
  completeComposioLink: h.complete,
  composioIdentity: h.identity,
  deleteComposioConnection: h.remove,
}));
vi.mock("../src/lib/server/workspaces", () => ({ connectIdentity: h.connect }));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: h.enqueue }));
vi.mock("../src/lib/server/entitlements", () => ({
  processingAllowed: async () => true,
}));
import { GET } from "../src/app/api/composio/callback/route";
const request = () =>
  new Request(
    "https://sotto.example/api/composio/callback?session_uri=opaque-session",
  );
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("APP_URL", "https://sotto.example");
  vi.stubEnv("PUBLIC_SIGNUP", "false");
  vi.stubEnv("ALLOWED_GOOGLE_EMAILS", "owner@example.com");
  h.cookie = "browser";
  h.workspace = null;
  h.pending = {
    user_id: "sotto_owner",
    connection_id: "ca_test",
    workspace_id: null,
    created_at: new Date(),
    start_filtering: true,
  };
  h.query.mockImplementation(async () => (h.pending ? [h.pending] : []));
  h.identity.mockResolvedValue({
    sub: "google-123",
    email: "owner@example.com",
  });
  h.connect.mockResolvedValue("workspace");
  h.session.mockResolvedValue("session-token");
});
afterEach(() => vi.unstubAllEnvs());
it("rejects a callback in another browser before activating the connection", async () => {
  h.cookie = undefined;
  expect((await GET(request())).headers.get("location")).toContain(
    "connection_error",
  );
  expect(h.complete).not.toHaveBeenCalled();
  expect(h.connect).not.toHaveBeenCalled();
});
it("refuses normal callback parameters and expired attempts", async () => {
  await GET(
    new Request(
      "https://sotto.example/api/composio/callback?status=success&connected_account_id=ca_test",
    ),
  );
  h.pending = null;
  await GET(request());
  expect(h.complete).not.toHaveBeenCalled();
  expect(h.connect).not.toHaveBeenCalled();
});
it("refuses a changed linking session and cleans only its own pending connection", async () => {
  h.pending.workspace_id = "original";
  h.workspace = "other";
  await GET(request());
  expect(h.complete).not.toHaveBeenCalled();
  expect(h.remove).toHaveBeenCalledWith("ca_test");
});
it("activates only its stored connection and filtering intent, preserving the verified Google identity", async () => {
  const response = await GET(request());
  expect(h.complete).toHaveBeenCalledWith(
    "opaque-session",
    "sotto_owner",
    "ca_test",
  );
  expect(h.connect).toHaveBeenCalledWith(
    { sub: "google-123", email: "owner@example.com" },
    undefined,
    null,
    h.pending.created_at,
    true,
    { id: "ca_test", userId: "sotto_owner" },
  );
  expect(h.enqueue).toHaveBeenCalledWith("google-123");
  expect(response.headers.get("location")).toBe(
    "https://sotto.example/review?connected=1",
  );
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(h.remove).not.toHaveBeenCalled();
});
it("does not save disallowed identities and removes the rejected provider connection", async () => {
  h.identity.mockResolvedValue({ sub: "other", email: "stranger@example.com" });
  await GET(request());
  expect(h.connect).not.toHaveBeenCalled();
  expect(h.remove).toHaveBeenCalledWith("ca_test");
});
it("keeps a successful connection when queue publication fails", async () => {
  h.enqueue.mockRejectedValue(new Error("Queue offline"));
  const response = await GET(request());
  expect(response.headers.get("location")).toContain("connected=1");
  expect(h.remove).not.toHaveBeenCalled();
});
