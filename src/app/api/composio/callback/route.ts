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

export async function GET(request: Request) {
  let ownedConnection: string | undefined;
  let saved = false;
  try {
    if (isDemo()) throw new Error("Demo has no connections");
    const uri = new URL(request.url).searchParams.get("session_uri");
    const browser = (await cookies()).get(composioCookie)?.value;
    // A normal Connect Link callback is deliberately insufficient. Require
    // Composio's deferred identity-verification callback and the same browser.
    if (!uri || uri.length > 4096 || !browser)
      throw new Error("Invalid callback");
    const [pending] = await query(
      "DELETE FROM composio_states WHERE browser_hash=$1 AND expires_at>now() RETURNING *",
      [hash(browser)],
    );
    if (!pending) throw new Error("Expired connection");
    ownedConnection = pending.connection_id;
    if (
      pending.workspace_id &&
      pending.workspace_id !== (await sessionWorkspace())
    )
      throw new Error("Linking session changed");
    await completeComposioLink(uri, pending.user_id, pending.connection_id);
    const connection = { id: pending.connection_id, userId: pending.user_id };
    const identity = await composioIdentity(connection);
    if (!publicSignup() && !allowedEmail(identity.email))
      throw new Error("Account not allowed");
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
    const response = NextResponse.redirect(
      `${appUrl()}/${(await processingAllowed(workspaceId)) ? "review" : "pricing"}?connected=1`,
    );
    response.cookies.set(sessionCookie, await createSession(workspaceId), {
      ...cookieOptions(),
      maxAge: 7 * 86400,
    });
    response.cookies.delete(composioCookie);
    return response;
  } catch {
    if (ownedConnection && !saved) {
      try {
        await deleteComposioConnection(ownedConnection);
      } catch {
        await queueComposioCleanup(ownedConnection);
      }
    }
    const response = NextResponse.redirect(
      `${appUrl()}/login?connection_error=1`,
    );
    response.cookies.delete(composioCookie);
    return response;
  }
}
