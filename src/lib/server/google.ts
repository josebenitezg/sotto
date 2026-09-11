import { OAuth2Client } from "google-auth-library";
import { appUrl, required, writesEnabled } from "./config";
import { query } from "./db";
import { unseal } from "./crypto";
import type { Mail } from "../types";
import {
  ComposioError,
  ensureComposioTrigger,
  stopComposioTrigger,
  deleteComposioConnection,
  type ComposioConnection,
} from "./composio";
import { composioGmailRequest } from "./composio-gmail";

export const gmailScope = "https://www.googleapis.com/auth/gmail.modify";
export function googleClient() {
  return new OAuth2Client({
    clientId: required("GOOGLE_CLIENT_ID"),
    clientSecret: required("GOOGLE_CLIENT_SECRET"),
    redirectUri: `${appUrl()}/api/google/callback`,
  });
}
export class GmailError extends Error {
  constructor(public status: number) {
    super(`Gmail request failed (${status})`);
  }
}
export type RawMessage = {
  id: string;
  threadId: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: Part;
};
type Part = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string };
  parts?: Part[];
};
export function emailAddress(from: string) {
  const match = from.match(
    /<?([a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9.-]+)>?/,
  );
  return match?.[1].toLowerCase() ?? "";
}
function extract(part?: Part, type = "text/plain"): string {
  if (!part || part.filename) return "";
  if (part.mimeType === type && part.body?.data)
    return Buffer.from(part.body.data, "base64url").toString("utf8");
  return (part.parts ?? [])
    .map((p) => extract(p, type))
    .filter(Boolean)
    .join("\n");
}
export function normalizeMessage(raw: RawMessage): Mail {
  const headers: Record<string, string> = {};
  for (const h of raw.payload?.headers ?? []) {
    const name = h.name.toLowerCase();
    // Keep the first occurrence; do not let an appended header override it.
    if (!(name in headers)) headers[name] = h.value;
  }
  const html = extract(raw.payload, "text/html");
  const text =
    extract(raw.payload) ||
    html
      .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
      .replace(/<[^>]+>/g, " ");
  return {
    id: raw.id,
    threadId: raw.threadId,
    from: headers.from ?? "",
    subject: (headers.subject ?? "(No subject)").slice(0, 500),
    text: text.replace(/https?:\/\/[^\s<>]+/gi, "[enlace]").slice(0, 16000),
    labels: raw.labelIds ?? [],
    headers,
    receivedAt: Number(raw.internalDate ?? 0),
  };
}

export class Gmail {
  private client?: OAuth2Client;
  constructor(
    token: string,
    private readonly accountId?: string,
    private readonly composio?: ComposioConnection,
  ) {
    if (!composio) {
      this.client = googleClient();
      this.client.setCredentials({ refresh_token: token });
    }
  }
  static async forAccount(id: string) {
    const [account] = await query(
      "SELECT token_cipher,mail_provider,composio_account_id,composio_user_id,composio_trigger_id FROM accounts WHERE id=$1 AND connected=true",
      [id],
    );
    if (
      account?.mail_provider === "composio" &&
      account.composio_account_id &&
      account.composio_user_id
    )
      return new Gmail("", id, {
        id: account.composio_account_id,
        userId: account.composio_user_id,
        triggerId: account.composio_trigger_id,
      });
    if (!account?.token_cipher) throw new Error("Account disconnected");
    return new Gmail(unseal(account.token_cipher, `gmail:${id}`), id);
  }
  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    if (this.composio) {
      // The classifier receives no tools; these are fixed server operations.
      // Validate the path before proxying to keep credentials on Google's host.
      if (
        !/^(profile|labels|messages|threads|history)(\/|\?|$)/.test(path) ||
        /(?:\.\.|[\\#])/.test(path)
      )
        throw new Error("Unsupported Gmail operation");
      try {
        return await composioGmailRequest<T>(this.composio, path, options);
      } catch (error) {
        if (error instanceof ComposioError) throw new GmailError(error.status);
        throw error;
      }
    }
    const { token } = await this.client!.getAccessToken();
    if (!token) throw new Error("Missing access token");
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/${path}`,
      {
        ...options,
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(20000),
        cache: "no-store",
      },
    );
    if (!response.ok) throw new GmailError(response.status);
    if (
      response.status === 204 ||
      response.headers.get("content-length") === "0"
    )
      return {} as T;
    const text = await response.text();
    return (text ? JSON.parse(text) : {}) as T;
  }
  async message(id: string) {
    return normalizeMessage(
      await this.request<RawMessage>(
        `messages/${encodeURIComponent(id)}?format=full`,
      ),
    );
  }
  async threadHasReply(id: string) {
    const thread = await this.request<{ messages?: RawMessage[] }>(
      `threads/${encodeURIComponent(id)}?format=minimal`,
    );
    return !!thread.messages?.some((m) => m.labelIds?.includes("SENT"));
  }
  async hasWrittenTo(sender: string) {
    if (!/^[a-z0-9._%+\-]+@[a-z0-9.\-]+$/i.test(sender)) return true;
    const result = await this.request<{ messages?: { id: string }[] }>(
      `messages?maxResults=1&q=${encodeURIComponent(`in:sent to:${sender}`)}`,
    );
    return !!result.messages?.length;
  }
  async ensureLabel(name: "Sotto/Cold" | "Sotto/Reading") {
    if (!writesEnabled(this.accountId))
      throw new Error("Mailbox writes disabled");
    const { labels } = await this.request<{
      labels: { id: string; name: string }[];
    }>("labels");
    const existing = labels.find((l) => l.name === name);
    if (existing) return existing.id;
    return (
      await this.request<{ id: string }>("labels", {
        method: "POST",
        body: JSON.stringify({
          name,
          labelListVisibility: "labelShow",
          messageListVisibility: "show",
        }),
      })
    ).id;
  }
  async modify(id: string, addLabelIds: string[], removeLabelIds: string[]) {
    if (!writesEnabled(this.accountId))
      throw new Error("Mailbox writes disabled");
    // This adapter deliberately exposes no send, trash, delete, or arbitrary mutation tools to the classifier.
    if (
      [...addLabelIds, ...removeLabelIds].some((label) =>
        ["TRASH", "SPAM", "UNREAD", "SENT", "DRAFT"].includes(label),
      )
    )
      throw new Error("Forbidden label");
    return this.request(`messages/${encodeURIComponent(id)}/modify`, {
      method: "POST",
      body: JSON.stringify({ addLabelIds, removeLabelIds }),
    });
  }
  async watch() {
    return this.request<{ historyId: string; expiration: string }>("watch", {
      method: "POST",
      body: JSON.stringify({
        topicName: required("GOOGLE_PUBSUB_TOPIC"),
        labelIds: ["INBOX"],
        labelFilterBehavior: "include",
      }),
    });
  }
  async ensureNotifications() {
    if (this.composio && this.accountId) {
      const triggerId = await ensureComposioTrigger(this.composio);
      await query(
        "UPDATE accounts SET composio_trigger_id=$2,last_watch=now(),watch_expires=NULL WHERE id=$1 AND composio_account_id=$3",
        [this.accountId, triggerId, this.composio.id],
      );
      this.composio.triggerId = triggerId;
    } else if (process.env.GOOGLE_PUBSUB_TOPIC && this.accountId) {
      const watch = await this.watch();
      await query(
        "UPDATE accounts SET watch_expires=$2,last_watch=now() WHERE id=$1",
        [this.accountId, new Date(Number(watch.expiration))],
      );
    }
  }
  async stop() {
    if (this.composio) return stopComposioTrigger(this.composio);
    return this.request("stop", { method: "POST" });
  }
  async revoke() {
    if (this.composio) return deleteComposioConnection(this.composio.id);
    await this.client!.revokeCredentials();
  }
}
