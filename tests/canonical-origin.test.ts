import { afterEach, expect, it, vi } from "vitest";
import {
  getRedirectUrl,
  unstable_getResponseFromNextConfig,
} from "next/experimental/testing/server";
import nextConfig from "../next.config";

afterEach(() => vi.unstubAllEnvs());

it.each(["/", "/login?connection_error=1", "/revision?account=work"])(
  "takes a www entry %s to the configured OAuth origin before rendering",
  async (path) => {
    vi.stubEnv("APP_URL", "https://sotto.example");
    const response = await unstable_getResponseFromNextConfig({
      url: `https://www.sotto.example${path}`,
      nextConfig,
    });
    expect(response.status).toBe(308);
    expect(getRedirectUrl(response)).toBe(`https://sotto.example${path}`);
  },
);

it.each([
  "https://sotto.example/login",
  "https://preview.example/login",
  "https://wwwXsottoXexample/login",
])("does not redirect the canonical host or unrelated host %s", async (url) => {
  vi.stubEnv("APP_URL", "https://sotto.example");
  const response = await unstable_getResponseFromNextConfig({ url, nextConfig });
  expect(getRedirectUrl(response)).toBeNull();
});

it.each(["", "http://localhost:3210", "https://www.sotto.example"])(
  "keeps demo, local, and already-www installations unchanged: %s",
  async (appUrl) => {
    vi.stubEnv("APP_URL", appUrl);
    expect(await nextConfig.redirects?.()).toEqual([]);
  },
);
