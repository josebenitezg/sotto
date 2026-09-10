import { afterEach, expect, it, vi } from "vitest";
import { aiConnection, classifierConfigured } from "../src/lib/server/ai";

afterEach(() => vi.unstubAllEnvs());

it("requires a dedicated OpenAI key even when legacy Gateway credentials exist", async () => {
  vi.stubEnv("OPENAI_API_KEY", "");
  vi.stubEnv("AI_PROVIDER", "vercel");
  vi.stubEnv("AI_GATEWAY_API_KEY", "gateway-test-only");
  vi.stubEnv("VERCEL_OIDC_TOKEN", "oidc-test-only");
  vi.stubEnv("VERCEL", "1");
  expect(classifierConfigured()).toBe(false);
  await expect(aiConnection()).rejects.toThrow("Classifier not configured");
});

it("sends classification only to OpenAI regardless of legacy provider settings", async () => {
  vi.stubEnv("OPENAI_API_KEY", "openai-test-only");
  vi.stubEnv("OPENAI_MODEL", "gpt-5-mini");
  vi.stubEnv("AI_PROVIDER", "vercel");
  expect(classifierConfigured()).toBe(true);
  expect(await aiConnection()).toEqual({
    url: "https://api.openai.com/v1/responses",
    token: "openai-test-only",
    model: "gpt-5-mini",
  });
});
