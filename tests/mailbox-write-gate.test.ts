import { beforeEach, afterEach, expect, it, vi } from "vitest";
const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("../src/lib/server/db", () => ({ query: h.query }));
import { writesEnabled } from "../src/lib/server/config";
import { Gmail } from "../src/lib/server/google";
import { seal } from "../src/lib/server/crypto";

beforeEach(() => {
  vi.stubEnv("ENABLE_MAILBOX_WRITES", "true");
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", "demo");
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("APP_URL", "https://sotto.example");
  vi.stubEnv("GOOGLE_CLIENT_ID", "synthetic");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "synthetic");
  vi.stubEnv("ENCRYPTION_KEY", "11".repeat(32));
  h.query.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it("keeps the global switch and synthetic UI mode as unconditional write blockers", () => {
  vi.stubEnv("ENABLE_MAILBOX_WRITES", "false");
  expect(writesEnabled("demo")).toBe(false);
  vi.stubEnv("ENABLE_MAILBOX_WRITES", "true");
  vi.stubEnv("DEMO_MODE", "true");
  expect(writesEnabled("demo")).toBe(false);
});
it("preserves unrestricted opt-in only when the account list is absent", () => {
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", undefined);
  expect(writesEnabled("demo")).toBe(true);
  expect(writesEnabled("pilot")).toBe(true);
});
it("matches exact case-sensitive IDs and denies callers without an account identity", () => {
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", " demo , demo_2 ");
  expect(writesEnabled("demo")).toBe(true);
  expect(writesEnabled("demo_2")).toBe(true);
  for (const id of [undefined, "pilot", "Demo", "demo-extra"])
    expect(writesEnabled(id)).toBe(false);
});
it.each([
  "",
  " ",
  "demo,",
  "demo,,pilot",
  "*",
  "demo,pilot/email",
  "demo@example.com",
  "x".repeat(256),
])("fails closed for an empty or malformed configured list (%s)", (ids) => {
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", ids);
  expect(writesEnabled("demo")).toBe(false);
  expect(writesEnabled("pilot")).toBe(false);
  expect(writesEnabled()).toBe(false);
});
it.each(["pilot", undefined])(
  "blocks the Gmail adapter before any request for %s",
  async (accountId) => {
    const gmail = new Gmail("synthetic-refresh", accountId);
    const request = vi.spyOn(gmail, "request");
    await expect(gmail.ensureLabel("Sotto/Cold")).rejects.toThrow("disabled");
    await expect(
      gmail.modify("message", ["Label_Cold"], ["INBOX"]),
    ).rejects.toThrow("disabled");
    expect(request).not.toHaveBeenCalled();
  },
);
it("binds a stored credential to its account and allows only that account's label operations", async () => {
  h.query.mockImplementation(async (_sql: string, [id]: string[]) => [
    { token_cipher: seal("synthetic-refresh", `gmail:${id}`) },
  ]);
  const demo = await Gmail.forAccount("demo");
  const request = vi
    .spyOn(demo, "request")
    .mockResolvedValueOnce({ labels: [] })
    .mockResolvedValueOnce({ id: "Label_Cold" })
    .mockResolvedValue({});
  expect(await demo.ensureLabel("Sotto/Cold")).toBe("Label_Cold");
  await demo.modify("message", ["Label_Cold"], ["INBOX"]);
  expect(request).toHaveBeenLastCalledWith("messages/message/modify", {
    method: "POST",
    body: JSON.stringify({
      addLabelIds: ["Label_Cold"],
      removeLabelIds: ["INBOX"],
    }),
  });
  const pilot = await Gmail.forAccount("pilot");
  const deniedRequest = vi.spyOn(pilot, "request");
  await expect(
    pilot.modify("private-message", ["INBOX"], ["Label_Cold"]),
  ).rejects.toThrow("disabled");
  expect(deniedRequest).not.toHaveBeenCalled();
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", "");
  request.mockClear();
  await expect(
    demo.modify("message", ["INBOX"], ["Label_Cold"]),
  ).rejects.toThrow("disabled");
  expect(request).not.toHaveBeenCalled();
});
