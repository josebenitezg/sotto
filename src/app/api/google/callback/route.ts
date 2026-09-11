import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleClient, gmailScope } from "@/lib/server/google";
import { appUrl, isDemo, publicSignup } from "@/lib/server/config";
import { hash, unseal } from "@/lib/server/crypto";
import { pilotAdmission } from "@/lib/server/global-config";
import { connectIdentity } from "@/lib/server/workspaces";
import { query } from "@/lib/server/db";
import { enqueueAccount } from "@/lib/server/queue";
import { processingAllowed } from "@/lib/server/entitlements";
import {
  ConnectionError,
  logConnectionFailure,
} from "@/lib/server/connection-error";
import type { ConnectionErrorCode } from "@/lib/connection-errors";
import {
  createSession,
  cookieOptions,
  oauthCookie,
  sessionCookie,
  sessionWorkspace,
} from "@/lib/server/auth";
export async function GET(request: Request) {
  const started = Date.now();
  let stage = "browser_state";
  let fallback: ConnectionErrorCode = "failed";
  console.info(
    JSON.stringify({ event: "gmail_connection_started", provider: "google" }),
  );
  try {
    if (isDemo()) throw new Error("Demo has no Google connections");
    const params = new URL(request.url).searchParams;
    const state = params.get("state"),
      code = params.get("code"),
      browser = (await cookies()).get(oauthCookie)?.value;
    if (params.has("error")) throw new ConnectionError("canceled");
    if (!state || !code || !browser) throw new ConnectionError("expired");
    const [pending] = await query(
      "DELETE FROM oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now() RETURNING verifier_cipher,workspace_id,created_at,start_filtering",
      [hash(state), hash(browser)],
    );
    if (!pending) throw new ConnectionError("expired");
    if (
      pending.workspace_id &&
      pending.workspace_id !== (await sessionWorkspace())
    )
      throw new ConnectionError("session_changed");
    stage = "token_exchange";
    fallback = "provider";
    const client = googleClient();
    const { tokens } = await client.getToken({
      code,
      codeVerifier: unseal(pending.verifier_cipher, `oauth:${hash(state)}`),
    });
    if (!tokens.id_token || !tokens.access_token)
      throw new Error("Incomplete authorization");
    stage = "google_identity";
    const identity = (
      await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
    ).getPayload();
    if (!identity?.sub || !identity.email || !identity.email_verified)
      throw new ConnectionError("provider");
    stage = "admission";
    fallback = "failed";
    if (
      !publicSignup() &&
      !(await pilotAdmission(identity.email, pending.workspace_id))
    )
      throw new ConnectionError("not_allowed", 403);
    stage = "gmail_permission";
    const info = await client.getTokenInfo(tokens.access_token);
    if (!info.scopes.includes(gmailScope))
      throw new ConnectionError("permissions", 403);
    stage = "workspace";
    const workspaceId = await connectIdentity(
      { sub: identity.sub, email: identity.email },
      tokens.refresh_token ?? undefined,
      pending.workspace_id,
      pending.created_at,
      pending.start_filtering === true,
    );
    try {
      await enqueueAccount(identity.sub);
    } catch {
      await query(
        "UPDATE accounts SET last_error='The account is connected. Use Check now to start processing.' WHERE id=$1",
        [identity.sub],
      );
    }
    stage = "session";
    const session = await createSession(workspaceId);
    const response = NextResponse.redirect(
      `${appUrl()}/${(await processingAllowed(workspaceId)) ? "review" : "pricing"}?connected=1`,
    );
    response.cookies.set(sessionCookie, session, {
      ...cookieOptions(),
      maxAge: 7 * 86400,
    });
    response.cookies.delete(oauthCookie);
    console.info(
      JSON.stringify({
        event: "gmail_connection_completed",
        provider: "google",
        durationMs: Date.now() - started,
      }),
    );
    return response;
  } catch (error) {
    const code = error instanceof ConnectionError ? error.code : fallback;
    logConnectionFailure("google", stage, code, error, started);
    const response = NextResponse.redirect(
      `${appUrl()}/login?connection_error=${code}`,
    );
    response.cookies.delete(oauthCookie);
    return response;
  }
}
