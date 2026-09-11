import { createHmac } from "node:crypto";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  completeComposioLink,
  composioIdentity,
  createComposioLink,
  verifyComposioWebhook,
  ensureComposioTrigger,
} from "../src/lib/server/composio";
import { Gmail, GmailError } from "../src/lib/server/google";
const fetchMock = vi.fn();
const connection = { id: "ca_test", userId: "sotto_owner" };
const json = (value: unknown, status = 200) =>
  new Response(JSON.stringify(value), { status });
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("COMPOSIO_API_KEY", "private-test");
  vi.stubEnv("COMPOSIO_AUTH_CONFIG_ID", "ac_test");
  vi.stubEnv("COMPOSIO_WEBHOOK_SECRET", "signing-test");
  vi.stubEnv("ENABLE_MAILBOX_WRITES", "true");
  vi.stubEnv("DEMO_MODE", "false");
  vi.stubEnv("MAILBOX_WRITE_ACCOUNT_IDS", "owner");
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
it("binds a new link to the server-owned user and rejects an unexpected redirect host", async () => {
  fetchMock.mockResolvedValueOnce(
    json({
      connected_account_id: "ca_test",
      redirect_url: "https://connect.composio.dev/link/test",
    }),
  );
  await createComposioLink(connection.userId);
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({
    user_id: "sotto_owner",
    auth_config_id: "ac_test",
  });
  fetchMock.mockResolvedValueOnce(
    json({
      connected_account_id: "ca_test",
      redirect_url: "https://attacker.example/",
    }),
  );
  await expect(createComposioLink(connection.userId)).rejects.toThrow(
    "Unexpected Composio redirect",
  );
});
it("requires the exact deferred connection and the selected managed auth config", async () => {
  fetchMock.mockResolvedValueOnce(
    json({ connected_account_id: "ca_other", toolkit_slug: "gmail" }),
  );
  await expect(
    completeComposioLink("session", "sotto_owner", "ca_test"),
  ).rejects.toThrow("Connection mismatch");
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fetchMock.mockResolvedValueOnce(
    json({ connected_account_id: "ca_test", toolkit_slug: "gmail" }),
  );
  fetchMock.mockResolvedValueOnce(
    json({
      id: "ca_test",
      status: "ACTIVE",
      is_disabled: false,
      toolkit: { slug: "gmail" },
      auth_config: {
        id: "ac_other",
        is_composio_managed: true,
        is_disabled: false,
      },
    }),
  );
  await expect(
    completeComposioLink("session", "sotto_owner", "ca_test"),
  ).rejects.toThrow("configuration mismatch");
});
it("uses verified Google identity and requires its email to match the actual mailbox", async () => {
  fetchMock.mockResolvedValueOnce(
    json({
      status: 200,
      data: { id: "123", email: "owner@example.com", verified_email: true },
    }),
  );
  fetchMock.mockResolvedValueOnce(
    json({ status: 200, data: { emailAddress: "other@example.com" } }),
  );
  await expect(composioIdentity(connection)).rejects.toThrow(
    "Gmail identity mismatch",
  );
  fetchMock.mockResolvedValueOnce(
    json({
      status: 200,
      data: { id: "123", email: "owner@example.com", verified_email: false },
    }),
  );
  await expect(composioIdentity(connection)).rejects.toThrow();
});
it("verifies signed raw bodies, rejects stale/future/tampered deliveries and handles malformed signatures", () => {
  const now = Date.now(),
    timestamp = String(Math.floor(now / 1000)),
    raw = '{"type":"test"}';
  const sign = createHmac("sha256", "signing-test")
    .update(`msg_test.${timestamp}.${raw}`)
    .digest("base64");
  const headers = new Headers({
    "webhook-id": "msg_test",
    "webhook-timestamp": timestamp,
    "webhook-signature": `v1,${sign}`,
  });
  expect(verifyComposioWebhook(raw, headers, now)).toBe("msg_test");
  expect(() => verifyComposioWebhook(raw + " ", headers, now)).toThrow();
  expect(() => verifyComposioWebhook(raw, headers, now + 301000)).toThrow();
  expect(() => verifyComposioWebhook(raw, headers, now - 301000)).toThrow();
  headers.set("webhook-signature", "v1,a");
  expect(() => verifyComposioWebhook(raw, headers, now)).toThrow();
});
it("pins mailbox operations to their connection and preserves UNREAD when moving or restoring", async () => {
  const gmail = new Gmail("", "owner", connection);
  fetchMock.mockImplementation(async () =>
    json({ successful: true, data: {} }),
  );
  await gmail.modify("abcd", ["Label_1"], ["INBOX"]);
  await gmail.modify("abcd", ["INBOX"], ["Label_1"]);
  expect(fetchMock.mock.calls.map(([, init]) => JSON.parse(init.body))).toEqual(
    [
      expect.objectContaining({
        connected_account_id: "ca_test",
        user_id: "sotto_owner",
        arguments: {
          user_id: "me",
          message_id: "abcd",
          add_label_ids: ["Label_1"],
          remove_label_ids: ["INBOX"],
        },
      }),
      expect.objectContaining({
        arguments: {
          user_id: "me",
          message_id: "abcd",
          add_label_ids: ["INBOX"],
          remove_label_ids: ["Label_1"],
        },
      }),
    ],
  );
  await expect(gmail.modify("abcd", [], ["UNREAD"])).rejects.toThrow(
    "Forbidden label",
  );
  await expect(
    new Gmail("", "someone_else", connection).modify("abcd", [], ["INBOX"]),
  ).rejects.toThrow("Mailbox writes disabled");
  await expect(
    gmail.request("messages/abcd/send", { method: "POST" }),
  ).rejects.toThrow("Unsupported Gmail operation");
  expect(fetchMock).toHaveBeenCalledTimes(2);
});
it("keeps raw MIME headers, received time and read state without using transformed snippets", async () => {
  fetchMock.mockResolvedValueOnce(
    json({
      status: 200,
      data: {
        id: "abcd",
        threadId: "thread",
        internalDate: "1234567",
        labelIds: ["INBOX", "UNREAD"],
        payload: {
          mimeType: "text/plain",
          headers: [
            {
              name: "Authentication-Results",
              value: "mx.google.com; dmarc=pass",
            },
          ],
          body: { data: Buffer.from("Body").toString("base64url") },
        },
      },
    }),
  );
  const mail = await new Gmail("", "owner", connection).message("abcd");
  expect(mail).toMatchObject({
    text: "Body",
    receivedAt: 1234567,
    labels: ["INBOX", "UNREAD"],
    headers: { "authentication-results": "mx.google.com; dmarc=pass" },
  });
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.endpoint).toBe(
    "https://www.googleapis.com/gmail/v1/users/me/messages/abcd?format=full",
  );
});
it("retains exact history cursors and signals expired cursors without leaking provider errors", async () => {
  const gmail = new Gmail("", "owner", connection);
  fetchMock.mockResolvedValueOnce(
    json({
      successful: true,
      data: {
        historyId: "90071992547409999",
        history: [],
        nextPageToken: "page",
      },
    }),
  );
  expect(
    await gmail.request(
      "history?startHistoryId=90071992547409998&pageToken=old",
    ),
  ).toMatchObject({ historyId: "90071992547409999", nextPageToken: "page" });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body).arguments).toMatchObject({
    start_history_id: "90071992547409998",
    page_token: "old",
  });
  fetchMock.mockResolvedValueOnce(
    json({ successful: false, error: "HTTP 404 private provider response" }),
  );
  await expect(gmail.request("history?startHistoryId=1")).rejects.toEqual(
    new GmailError(404),
  );
});
it("creates a scoped polling trigger using the live schema", async () => {
  fetchMock.mockResolvedValueOnce(json({ trigger_id: "ti_test" }));
  expect(await ensureComposioTrigger(connection)).toBe("ti_test");
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toMatchObject({
    connected_account_id: "ca_test",
    user_id: "sotto_owner",
    trigger_config: { labelIds: "INBOX", userId: "me", interval: 15 },
  });
});
