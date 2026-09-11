import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { required } from "./config";

const base = "https://backend.composio.dev/api/v3.1";
export const composioCookie = "sotto_composio";
export const newMailTrigger = "GMAIL_NEW_GMAIL_MESSAGE";
const identifier = z.string().regex(/^[a-zA-Z0-9_-]{1,255}$/);
export type ComposioConnection = {
  id: string;
  userId: string;
  triggerId?: string | null;
};
export class ComposioError extends Error {
  constructor(readonly status: number) {
    super(`Composio HTTP ${status}`);
  }
}

export async function composioRequest<T>(
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(`${base}${path}`, {
    method,
    headers: {
      "x-api-key": required("COMPOSIO_API_KEY"),
      "Content-Type": "application/json",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(20000),
    cache: "no-store",
    redirect: "error",
  });
  // Never expose response bodies: they may contain credentials or Gmail data.
  if (!response.ok) throw new ComposioError(response.status);
  const text = await response.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function createComposioLink(userId: string) {
  const link = z
    .object({ connected_account_id: identifier, redirect_url: z.url() })
    .parse(
      await composioRequest("/connected_accounts/link", {
        auth_config_id: required("COMPOSIO_AUTH_CONFIG_ID"),
        user_id: userId,
      }),
    );
  const url = new URL(link.redirect_url);
  if (url.protocol !== "https:" || url.hostname !== "connect.composio.dev")
    throw new Error("Unexpected Composio redirect");
  return link;
}

export async function completeComposioLink(
  sessionUri: string,
  userId: string,
  expectedId: string,
) {
  const completed = z
    .object({
      connected_account_id: identifier,
      toolkit_slug: z.literal("gmail"),
    })
    .parse(
      await composioRequest("/connected_accounts/complete_auth", {
        session_uri: sessionUri,
        user_id: userId,
      }),
    );
  if (completed.connected_account_id !== expectedId)
    throw new Error("Connection mismatch");
  const connection = z
    .object({
      id: identifier,
      status: z.literal("ACTIVE"),
      is_disabled: z.literal(false),
      toolkit: z.object({ slug: z.literal("gmail") }),
      auth_config: z.object({
        id: identifier,
        is_composio_managed: z.literal(true),
        is_disabled: z.literal(false),
      }),
    })
    .parse(
      await composioRequest(
        `/connected_accounts/${encodeURIComponent(expectedId)}`,
      ),
    );
  if (
    connection.id !== expectedId ||
    connection.auth_config.id !== required("COMPOSIO_AUTH_CONFIG_ID")
  )
    throw new Error("Connection configuration mismatch");
}

export async function composioProxy<T>(
  connection: ComposioConnection,
  endpoint: string,
  method = "GET",
  body?: unknown,
) {
  identifier.parse(connection.id);
  // Only Google's user identity and the Gmail adapter can use this transport.
  if (
    !endpoint.startsWith("/gmail/v1/users/me/") &&
    endpoint !== "/oauth2/v2/userinfo"
  )
    throw new Error("Unsupported Google endpoint");
  const result = await composioRequest<{ status: number; data?: T }>(
    "/tools/execute/proxy",
    {
      connected_account_id: connection.id,
      endpoint: `https://www.googleapis.com${endpoint}`,
      method,
      ...(body === undefined ? {} : { body }),
    },
  );
  if (
    !Number.isInteger(result.status) ||
    result.status < 200 ||
    result.status >= 300
  )
    throw new ComposioError(
      Number.isInteger(result.status) ? result.status : 502,
    );
  return result.data as T;
}

export async function composioIdentity(connection: ComposioConnection) {
  const identity = z
    .object({
      id: identifier,
      email: z.email(),
      verified_email: z.literal(true),
    })
    .parse(await composioProxy(connection, "/oauth2/v2/userinfo"));
  const profile = z
    .object({ emailAddress: z.email() })
    .parse(await composioProxy(connection, "/gmail/v1/users/me/profile"));
  if (identity.email.toLowerCase() !== profile.emailAddress.toLowerCase())
    throw new Error("Gmail identity mismatch");
  return { sub: identity.id, email: identity.email.toLowerCase() };
}

export async function ensureComposioTrigger(connection: ComposioConnection) {
  const result = z.object({ trigger_id: identifier }).parse(
    await composioRequest(`/trigger_instances/${newMailTrigger}/upsert`, {
      connected_account_id: connection.id,
      user_id: connection.userId,
      trigger_config: { labelIds: "INBOX", userId: "me", interval: 15 },
      toolkit_versions: { gmail: "20260911_00" },
    }),
  );
  return result.trigger_id;
}
export async function stopComposioTrigger(connection: ComposioConnection) {
  if (connection.triggerId)
    await composioRequest(
      `/trigger_instances/manage/${encodeURIComponent(connection.triggerId)}`,
      undefined,
      "DELETE",
    );
}
export async function deleteComposioConnection(id: string) {
  identifier.parse(id);
  try {
    await composioRequest(
      `/connected_accounts/${encodeURIComponent(id)}/revoke`,
      {},
    );
  } finally {
    await composioRequest(
      `/connected_accounts/${encodeURIComponent(id)}`,
      undefined,
      "DELETE",
    );
  }
}

export function verifyComposioWebhook(
  raw: string,
  headers: Headers,
  now = Date.now(),
) {
  const id = headers.get("webhook-id"),
    timestamp = headers.get("webhook-timestamp"),
    signature = headers.get("webhook-signature");
  if (
    !id ||
    id.length > 200 ||
    !timestamp ||
    !/^\d+$/.test(timestamp) ||
    !signature ||
    signature.length > 1000 ||
    Math.abs(now / 1000 - Number(timestamp)) > 300
  )
    throw new Error("Invalid webhook");
  const expected = createHmac("sha256", required("COMPOSIO_WEBHOOK_SECRET"))
    .update(`${id}.${timestamp}.${raw}`)
    .digest("base64");
  const valid = signature.split(" ").some((value) => {
    const actual = value.startsWith("v1,") ? value.slice(3) : value;
    return (
      actual.length === expected.length &&
      timingSafeEqual(Buffer.from(actual), Buffer.from(expected))
    );
  });
  if (!valid) throw new Error("Invalid webhook");
  return id;
}
