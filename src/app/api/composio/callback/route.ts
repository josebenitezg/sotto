import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  allowedEmail,
  appUrl,
  isDemo,
  publicSignup,
} from "@/lib/server/config";
import { hash } from "@/lib/server/crypto";
import { query } from "@/lib/server/db";
import {
  composioCookie,
  completeComposioLink,
  composioIdentity,
  deleteComposioConnection,
} from "@/lib/server/composio";
import { connectIdentity } from "@/lib/server/workspaces";
import { enqueueAccount } from "@/lib/server/queue";
import { processingAllowed } from "@/lib/server/entitlements";
import {
  cookieOptions,
  createSession,
  sessionCookie,
  sessionWorkspace,
} from "@/lib/server/auth";
import { queueComposioCleanup } from "@/lib/server/composio-cleanup";
import {
  ConnectionError,
  logConnectionFailure,
} from "@/lib/server/connection-error";
import type { ConnectionErrorCode } from "@/lib/connection-errors";

export async function GET(request: Request) {
  let ownedConnection: string | undefined;
  let saved = false;
  let stage = "browser_state";
  let fallback: ConnectionErrorCode = "failed";
  const started = Date.now();
  console.info(
    JSON.stringify({ event: "gmail_connection_started", provider: "composio" }),
  );
  try {
    if (isDemo()) throw new Error("Demo has no connections");
    const params = new URL(request.url).searchParams;
    if (params.get("error") === "access_denied")
      throw new ConnectionError("canceled");
    if (params.get("status") === "failed")
      throw new ConnectionError("provider");
    const uri = params.get("session_uri");
    const browser = (await cookies()).get(composioCookie)?.value;
    // A normal Connect Link callback is deliberately insufficient. Require
    // Composio's deferred identity-verification callback and the same browser.
    if (!uri || uri.length > 4096 || !browser)
      throw new ConnectionError("expired");
    const [pending] = await query(
      "DELETE FROM composio_states WHERE browser_hash=$1 AND expires_at>now() RETURNING *",
      [hash(browser)],
    );
    if (!pending) throw new ConnectionError("expired");
    ownedConnection = pending.connection_id;
    if (
      pending.workspace_id &&
      pending.workspace_id !== (await sessionWorkspace())
    )
      throw new ConnectionError("session_changed");
    stage = "complete_auth";
    fallback = "provider";
    await completeComposioLink(uri, pending.user_id, pending.connection_id);
    const connection = { id: pending.connection_id, userId: pending.user_id };
    stage = "google_identity";
    const identity = await composioIdentity(connection);
    stage = "admission";
    fallback = "failed";
    if (!publicSignup() && !allowedEmail(identity.email))
      throw new ConnectionError("not_allowed", 403);
    stage = "workspace";
    const workspaceId = await connectIdentity(
      identity,
      undefined,
      pending.workspace_id,
      pending.created_at,
      pending.start_filtering === true,
      connection,
    );
    saved = true;
    try {
      await enqueueAccount(identity.sub);
    } catch {
      await query(
        "UPDATE accounts SET last_error='Connected. Use Check now to start processing.' WHERE id=$1",
        [identity.sub],
      );
    }
    stage = "session";
    const response = NextResponse.redirect(
      `${appUrl()}/${(await processingAllowed(workspaceId)) ? "review" : "pricing"}?connected=1`,
    );
    response.cookies.set(sessionCookie, await createSession(workspaceId), {
      ...cookieOptions(),
      maxAge: 7 * 86400,
    });
    response.cookies.delete(composioCookie);
    console.info(
      JSON.stringify({
        event: "gmail_connection_completed",
        provider: "composio",
        durationMs: Date.now() - started,
      }),
    );
    return response;
  } catch (error) {
    const code = error instanceof ConnectionError ? error.code : fallback;
    logConnectionFailure("composio", stage, code, error, started);
    if (ownedConnection && !saved) {
      try {
        await deleteComposioConnection(ownedConnection);
      } catch {
        try {
          await queueComposioCleanup(ownedConnection);
        } catch {
          console.warn(
            JSON.stringify({
              event: "gmail_connection_cleanup_failed",
              provider: "composio",
            }),
          );
        }
      }
    }
    const response = NextResponse.redirect(
      `${appUrl()}/login?connection_error=${code}`,
    );
    response.cookies.delete(composioCookie);
    return response;
  }
}
