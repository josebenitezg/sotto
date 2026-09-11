import { beforeEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/lib/server/db", () => ({ query: h.query }));
import { recordAiUsage } from "../src/lib/server/ai-usage";
beforeEach(() => {
  h.query.mockReset();
});
it("stores only provider token counts, model and the owning account", async () => {
  await recordAiUsage("account-a", "gpt-5-mini", {
    input_tokens: 1000,
    input_tokens_details: { cached_tokens: 400 },
    output_tokens: 120,
    body: "private mail",
    secret: "token",
  });
  expect(h.query.mock.calls[0][1]).toEqual([
    "account-a",
    "gpt-5-mini",
    1000,
    400,
    120,
  ]);
  expect(JSON.stringify(h.query.mock.calls)).not.toContain("private mail");
});
it("rejects invalid usage and does not attribute unowned calls", async () => {
  for (const usage of [
    null,
    {},
    { input_tokens: -1, output_tokens: 1 },
    {
      input_tokens: 3,
      output_tokens: 1,
      input_tokens_details: { cached_tokens: 4 },
    },
    { input_tokens: 4, output_tokens: Infinity },
  ])
    await recordAiUsage("a", "gpt-5-mini", usage);
  await recordAiUsage(undefined, "gpt-5-mini", {
    input_tokens: 4,
    output_tokens: 1,
  });
  expect(h.query).not.toHaveBeenCalled();
});
