import { beforeEach, afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({
  query: vi.fn(),
  connect: vi.fn(),
  enqueue: vi.fn(),
  pending: null as any,
  generate: vi.fn(),
  token: vi.fn(),
  verify: vi.fn(),
  tokenInfo: vi.fn(),
  cookie: undefined as string | undefined,
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "sotto_oauth" && h.cookie ? { value: h.cookie } : undefined,
  }),
}));
vi.mock("../src/lib/server/db", () => ({ query: h.query }));
vi.mock("../src/lib/server/workspaces", () => ({ connectIdentity: h.connect }));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: h.enqueue }));
vi.mock("../src/lib/server/google", () => ({
  gmailScope: "https://www.googleapis.com/auth/gmail.modify",
  googleClient: () => ({
    generateAuthUrl: h.generate,
    getToken: h.token,
    verifyIdToken: h.verify,
    getTokenInfo: h.tokenInfo,
  }),
}));
import { POST } from "../src/app/api/google/connect/route";
import { GET } from "../src/app/api/google/callback/route";
import { hash, seal } from "../src/lib/server/crypto";
beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "info").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  h.cookie = undefined;
  h.pending = null;
  for (const [key, value] of Object.entries({
    DEMO_MODE: "false",
    BILLING_ENABLED: "false",
    PUBLIC_SIGNUP: "false",
    APP_URL: "https://sotto.example",
    DATABASE_URL: "synthetic",
    ENCRYPTION_KEY: "11".repeat(32),
    ALLOWED_GOOGLE_EMAILS: "owner@example.com",
    GOOGLE_CLIENT_ID: "client",
    GOOGLE_CLIENT_SECRET: "synthetic",
  }))
    vi.stubEnv(key, value);
  h.generate.mockReturnValue(
    "https://accounts.google.com/o/oauth2/v2/auth?state=synthetic",
  );
  h.query.mockImplementation(async (sql: string) =>
    sql.startsWith("DELETE FROM oauth_states")
      ? h.pending
        ? [h.pending]
        : []
      : [],
  );
  h.connect.mockResolvedValue("workspace");
  h.token.mockResolvedValue({
    tokens: {
      id_token: "id",
      access_token: "access",
      refresh_token: "refresh",
    },
  });
  h.verify.mockResolvedValue({
    getPayload: () => ({
      sub: "account",
      email: "owner@example.com",
      email_verified: true,
    }),
  });
  h.tokenInfo.mockResolvedValue({
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});
it("stores the explicit filtering intent alongside the browser-bound OAuth state", async () => {
  const request = (body: string) =>
    new Request("https://sotto.example/api/google/connect", {
      method: "POST",
      headers: {
        origin: "https://sotto.example",
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
  const response = await POST(request("intent=filter"));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toContain("hl=en");
  expect(response.headers.get("set-cookie")).toContain("HttpOnly");
  expect(h.query.mock.calls[0][1][4]).toBe(true);
  await POST(request(""));
  expect(h.query.mock.calls[1][1][4]).toBe(false);
  const forged = request("intent=filter");
  forged.headers.set("origin", "https://other.example");
  expect((await POST(forged)).status).toBe(403);
});
it.each([true, false])(
  "uses only the stored intent on callback (%s) and returns directly to the inbox",
  async (start_filtering) => {
    h.cookie = "browser";
    const created_at = new Date();
    h.pending = {
      verifier_cipher: seal("verifier", `oauth:${hash("state")}`),
      workspace_id: null,
      created_at,
      start_filtering,
    };
    const response = await GET(
      new Request(
        "https://sotto.example/api/google/callback?code=code&state=state&intent=filter",
      ),
    );
    expect(h.connect).toHaveBeenCalledWith(
      { sub: "account", email: "owner@example.com" },
      "refresh",
      null,
      created_at,
      start_filtering,
    );
    expect(h.enqueue).toHaveBeenCalledWith("account");
    expect(response.headers.get("location")).toBe(
      "https://sotto.example/review?connected=1",
    );
  },
);
it("requests the basic profile and forwards a Google-hosted picture", async () => {
  await POST(
    new Request("https://sotto.example/api/google/connect", {
      method: "POST",
      headers: { origin: "https://sotto.example" },
      body: "intent=filter",
    }),
  );
  expect(h.generate.mock.calls[0][0].scope).toContain("profile");
  h.cookie = "browser";
  h.pending = {
    verifier_cipher: seal("verifier", `oauth:${hash("state")}`),
    workspace_id: null,
    created_at: new Date(),
    start_filtering: true,
  };
  h.verify.mockResolvedValue({
    getPayload: () => ({
      sub: "account",
      email: "owner@example.com",
      email_verified: true,
      name: "Owner",
      picture: "https://lh3.googleusercontent.com/a/owner",
    }),
  });
  await GET(
    new Request(
      "https://sotto.example/api/google/callback?code=code&state=state",
    ),
  );
  expect(h.connect.mock.calls[0][0]).toEqual({
    sub: "account",
    email: "owner@example.com",
    name: "Owner",
    picture: "https://lh3.googleusercontent.com/a/owner",
  });
  const session = h.query.mock.calls.find(([sql]) =>
    String(sql).startsWith("INSERT INTO sessions"),
  );
  expect(session?.[1][2]).toBe("account");
});
it("never connects or activates an expired OAuth attempt", async () => {
  h.cookie = "browser";
  const response = await GET(
    new Request(
      "https://sotto.example/api/google/callback?code=code&state=expired&intent=filter",
    ),
  );
  expect(response.headers.get("location")).toContain(
    "connection_error=expired",
  );
  expect(h.connect).not.toHaveBeenCalled();
  expect(h.enqueue).not.toHaveBeenCalled();
});

it("distinguishes a pilot rejection from missing Gmail permission", async () => {
  h.cookie = "browser";
  h.pending = {
    verifier_cipher: seal("verifier", `oauth:${hash("state")}`),
    workspace_id: null,
    created_at: new Date(),
    start_filtering: true,
  };
  const request = () =>
    new Request(
      "https://sotto.example/api/google/callback?code=code&state=state",
    );
  vi.stubEnv("ALLOWED_GOOGLE_EMAILS", "another@example.com");
  expect((await GET(request())).headers.get("location")).toContain(
    "connection_error=not_allowed",
  );
  vi.stubEnv("ALLOWED_GOOGLE_EMAILS", "owner@example.com");
  h.tokenInfo.mockResolvedValue({ scopes: [] });
  expect((await GET(request())).headers.get("location")).toContain(
    "connection_error=permissions",
  );
  expect(h.connect).not.toHaveBeenCalled();
});
