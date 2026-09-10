import { afterEach, expect, it, vi } from "vitest";
import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server";
import nextConfig from "../next.config";
import { HttpError, requireOrigin } from "../src/lib/server/auth";

afterEach(() => vi.unstubAllEnvs());

it.each(["/", "/login", "/planes"])(
  "keeps native POST origins available on %s without external referrers",
  async (path) => {
    vi.stubEnv("APP_URL", "https://sotto.example");
    const response = await unstable_getResponseFromNextConfig({
      url: `https://sotto.example${path}`,
      nextConfig,
    });
    // no-referrer makes native form submissions send Origin: null, which
    // must remain rejected by the server's strict same-origin check.
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
  },
);

it.each([undefined, "null", "https://other.example", "https://www.sotto.example"])(
  "still rejects a POST from an absent, opaque, or foreign origin: %s",
  (origin) => {
    vi.stubEnv("APP_URL", "https://sotto.example");
    const request = new Request("https://sotto.example/api/google/connect", {
      method: "POST",
      headers: origin === undefined ? {} : { origin },
    });
    expect(() => requireOrigin(request)).toThrow(HttpError);
  },
);

it("accepts a native form POST from the canonical origin", () => {
  vi.stubEnv("APP_URL", "https://sotto.example");
  expect(() =>
    requireOrigin(
      new Request("https://sotto.example/api/google/connect", {
        method: "POST",
        headers: { origin: "https://sotto.example" },
      }),
    ),
  ).not.toThrow();
});
