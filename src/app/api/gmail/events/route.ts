import { OAuth2Client } from "google-auth-library";
import { z } from "zod";
import { required, isDemo } from "@/lib/server/config";
import { query } from "@/lib/server/db";
import { enqueueAccount } from "@/lib/server/queue";
const verifier = new OAuth2Client();
export async function POST(request: Request) {
  if (isDemo()) return new Response(null, { status: 404 });
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return new Response(null, { status: 401 });
  try {
    const ticket = await verifier.verifyIdToken({
      idToken: auth.slice(7),
      audience: required("PUBSUB_AUDIENCE"),
    });
    const identity = ticket.getPayload();
    if (
      !identity?.email_verified ||
      identity.email !== required("PUBSUB_SERVICE_ACCOUNT_EMAIL")
    )
      return new Response(null, { status: 403 });
  } catch {
    return new Response(null, { status: 401 });
  }
  let event, payload;
  try {
    const raw = await request.text();
    if (raw.length > 65536) return new Response(null, { status: 413 });
    event = z
      .object({
        message: z.object({
          messageId: z.string().max(200),
          data: z.string().max(4000),
        }),
      })
      .parse(JSON.parse(raw));
    payload = z
      .object({
        emailAddress: z.email(),
        // Keep large string cursors exact; accept numeric JSON only when it
        // can be converted without losing integer precision.
        historyId: z.union([
          z.string().regex(/^\d+$/),
          z.number().int().nonnegative().transform(String),
        ]),
      })
      .parse(
        JSON.parse(
          Buffer.from(event.message.data, "base64url").toString("utf8"),
        ),
      );
  } catch {
    return new Response(null, { status: 400 });
  }
  try {
    // Keep the account row until the insert commits. Deletion either removes
    // this event by cascade or commits first and leaves no account to insert.
    const [account] = await query(
      `WITH active AS (
        SELECT id FROM accounts WHERE email=$2 AND connected=true FOR KEY SHARE
      ), saved AS (
        INSERT INTO mailbox_events(id,account_id,history_id)
          SELECT $1,id,$3 FROM active ON CONFLICT DO NOTHING
      ) SELECT id FROM active`,
      [
        event.message.messageId,
        payload.emailAddress.toLowerCase(),
        payload.historyId,
      ],
    );
    if (account) {
      await enqueueAccount(account.id, `gmail:${event.message.messageId}`);
    }
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 503 });
  }
}
