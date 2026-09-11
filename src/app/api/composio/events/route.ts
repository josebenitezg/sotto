import { z } from "zod";
import { isDemo, required } from "@/lib/server/config";
import { verifyComposioWebhook, newMailTrigger } from "@/lib/server/composio";
import { query } from "@/lib/server/db";
import { enqueueAccount } from "@/lib/server/queue";

export async function POST(request: Request) {
  if (isDemo()) return new Response(null, { status: 404 });
  const raw = await request.text();
  if (raw.length > 1024 * 1024) return new Response(null, { status: 413 });
  let delivery: string;
  try {
    delivery = verifyComposioWebhook(raw, request.headers);
  } catch {
    return new Response(null, { status: 401 });
  }
  let event;
  try {
    event = z
      .object({
        type: z.string(),
        metadata: z.object({
          trigger_slug: z.string().optional(),
          connected_account_id: z.string().max(255),
          user_id: z.string().max(255),
          auth_config_id: z.string().max(255),
        }),
      })
      .parse(JSON.parse(raw));
  } catch {
    return new Response(null, { status: 400 });
  }
  if (
    event.type !== "composio.trigger.message" ||
    event.metadata.trigger_slug !== newMailTrigger
  )
    return new Response(null, { status: 204 });
  if (event.metadata.auth_config_id !== required("COMPOSIO_AUTH_CONFIG_ID"))
    return new Response(null, { status: 204 });
  try {
    // Save only routing metadata. Always fetch the actual message from Gmail;
    // the webhook body never becomes classifier input or an application log.
    const [account] = await query(
      `WITH active AS (
      SELECT id FROM accounts WHERE composio_account_id=$2 AND composio_user_id=$3
        AND mail_provider='composio' AND connected=true AND mode<>'paused' FOR KEY SHARE
    ), saved AS (
      INSERT INTO mailbox_events(id,account_id,history_id) SELECT $1,id,'0' FROM active ON CONFLICT DO NOTHING
    ) SELECT id FROM active`,
      [
        `composio:${delivery}`,
        event.metadata.connected_account_id,
        event.metadata.user_id,
      ],
    );
    if (account) await enqueueAccount(account.id, `composio:${delivery}`);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
