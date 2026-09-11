import { z } from "zod";
import {
  composioProxy,
  composioRequest,
  ComposioError,
  type ComposioConnection,
} from "./composio";

// Pin deterministic operations. The AI never receives these tools or a token.
const toolNames = [
  "GMAIL_GET_PROFILE",
  "GMAIL_LIST_HISTORY",
  "GMAIL_FETCH_EMAILS",
  "GMAIL_LIST_LABELS",
  "GMAIL_CREATE_LABEL",
  "GMAIL_ADD_LABEL_TO_EMAIL",
] as const;
async function execute(
  connection: ComposioConnection,
  slug: (typeof toolNames)[number],
  args: Record<string, unknown>,
) {
  const result = await composioRequest<{
    successful: boolean;
    data: unknown;
    error?: string;
  }>(`/tools/execute/${slug}`, {
    connected_account_id: connection.id,
    user_id: connection.userId,
    version: "20260911_00",
    arguments: { user_id: "me", ...args },
  });
  if (result.successful !== true) {
    // Extract only a status, never surface the provider's potentially private body.
    const status =
      typeof result.error === "string"
        ? /\b(400|401|403|404|409|429|500|502|503|504)\b/.exec(
            result.error,
          )?.[1]
        : undefined;
    throw new ComposioError(status ? Number(status) : 502);
  }
  return result.data;
}
export async function composioGmailRequest<T>(
  connection: ComposioConnection,
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = new URL(path, "https://www.googleapis.com/gmail/v1/users/me/");
  const route = url.pathname.replace("/gmail/v1/users/me/", "");
  const method = options.method ?? "GET";
  const params = url.searchParams;
  let data: unknown;
  if (method === "GET" && route === "profile") {
    data = z
      .object({ emailAddress: z.email(), historyId: z.string().regex(/^\d+$/) })
      .passthrough()
      .parse(await execute(connection, "GMAIL_GET_PROFILE", {}));
  } else if (method === "GET" && route === "history") {
    data = z
      .object({ historyId: z.string().regex(/^\d+$/) })
      .passthrough()
      .parse(
        await execute(connection, "GMAIL_LIST_HISTORY", {
          start_history_id: params.get("startHistoryId"),
          ...(params.has("pageToken")
            ? { page_token: params.get("pageToken") }
            : {}),
        }),
      );
  } else if (method === "GET" && route === "messages") {
    const result = z
      .object({
        messages: z.array(
          z.object({
            id: z.string().optional(),
            messageId: z.string().optional(),
            threadId: z.string().optional(),
          }),
        ),
        nextPageToken: z.string().nullish(),
      })
      .parse(
        await execute(connection, "GMAIL_FETCH_EMAILS", {
          query: params.get("q") ?? "",
          max_results: Number(params.get("maxResults") ?? 100),
          ids_only: true,
          ...(params.has("pageToken")
            ? { page_token: params.get("pageToken") }
            : {}),
        }),
      );
    data = {
      messages: result.messages.map((m) => ({
        id: z
          .string()
          .min(1)
          .parse(m.id ?? m.messageId),
        threadId: m.threadId,
      })),
      nextPageToken: result.nextPageToken ?? undefined,
    };
  } else if (method === "GET" && route === "labels") {
    data = z
      .object({
        labels: z.array(z.object({ id: z.string(), name: z.string() })),
      })
      .parse(
        await execute(connection, "GMAIL_LIST_LABELS", {
          include_details: false,
        }),
      );
  } else if (method === "POST" && route === "labels") {
    const body = z
      .object({ name: z.enum(["Sotto/Cold", "Sotto/Reading"]) })
      .parse(JSON.parse(String(options.body)));
    data = await execute(connection, "GMAIL_CREATE_LABEL", {
      label_name: body.name,
      label_list_visibility: "labelShow",
      message_list_visibility: "show",
    });
  } else if (
    method === "POST" &&
    /^messages\/[a-zA-Z0-9_-]+\/modify$/.test(route)
  ) {
    const body = z
      .object({
        addLabelIds: z.array(z.string()),
        removeLabelIds: z.array(z.string()),
      })
      .parse(JSON.parse(String(options.body)));
    data = await execute(connection, "GMAIL_ADD_LABEL_TO_EMAIL", {
      message_id: route.split("/")[1],
      add_label_ids: body.addLabelIds,
      remove_label_ids: body.removeLabelIds,
    });
  } else if (
    method === "GET" &&
    /^(messages|threads)\/[a-zA-Z0-9_-]+$/.test(route)
  ) {
    // Raw MIME preserves Google's authentication headers and internal date.
    // Thread reads request minimal metadata, without fetching attachments.
    data = await composioProxy(connection, `/gmail/v1/users/me/${path}`);
  } else throw new Error("Unsupported Gmail operation");
  return data as T;
}
