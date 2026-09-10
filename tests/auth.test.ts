import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { allowedEmail } from "../src/lib/server/config";
const state = vi.hoisted(() => ({
  cookie: undefined as string | undefined,
  query: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (state.cookie ? { value: state.cookie } : undefined),
  }),
}));
vi.mock("../src/lib/server/db", () => ({ query: state.query }));
import {
  requireOrigin,
  requireSession,
  authenticated,
} from "../src/lib/server/auth";
beforeEach(() => {
  vi.stubEnv("APP_URL", "https://sotto.example");
  state.cookie = undefined;
  state.query.mockReset();
});
afterEach(() => vi.unstubAllEnvs());
describe("owner session and request boundaries", () => {
  it("rejects missing and expired sessions", async () => {
    expect(await authenticated()).toBe(false);
    expect(state.query).not.toHaveBeenCalled();
    state.cookie = "expired-session";
    state.query.mockResolvedValue([]);
    await expect(requireSession()).rejects.toMatchObject({ status: 401 });
  });
  it("looks up only hashed session credentials", async () => {
    state.cookie = "opaque-private-token";
    state.query.mockResolvedValue([{ exists: true }]);
    expect(await authenticated()).toBe(true);
    expect(state.query.mock.calls[0][1][0]).not.toBe(state.cookie);
    expect(state.query.mock.calls[0][0]).toContain("expires_at>now()");
  });
  it("rejects absent, cross-site and lookalike origins", () => {
    for (const origin of [
      null,
      "https://evil.example",
      "https://sotto.example.evil.test",
    ]) {
      expect(() =>
        requireOrigin(
          new Request("https://sotto.example/api/actions", {
            headers: origin ? { origin } : {},
          }),
        ),
      ).toThrow();
    }
    expect(() =>
      requireOrigin(
        new Request("https://sotto.example/api/actions", {
          headers: { origin: "https://sotto.example" },
        }),
      ),
    ).not.toThrow();
  });
  it("uses exact email allowlisting, not domain or substring matching", () => {
    vi.stubEnv(
      "ALLOWED_GOOGLE_EMAILS",
      "owner@studio.example, personal@gmail.example",
    );
    expect(allowedEmail("OWNER@studio.example")).toBe(true);
    expect(allowedEmail("attacker@studio.example")).toBe(false);
    expect(allowedEmail("owner@studio.example.evil.test")).toBe(false);
  });
});
