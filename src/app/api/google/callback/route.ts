import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { googleClient, gmailScope } from "@/lib/server/google";
import { allowedEmail, appUrl, isDemo } from "@/lib/server/config";
import { hash, seal, unseal } from "@/lib/server/crypto";
import { query } from "@/lib/server/db";
import { enqueueAccount } from "@/lib/server/queue";
import {
  createSession,
  cookieOptions,
  oauthCookie,
  sessionCookie,
} from "@/lib/server/auth";
export async function GET(request: Request) {
  try {
    if (isDemo()) throw new Error("Demo has no Google connections");
    const params = new URL(request.url).searchParams;
    const state = params.get("state"),
      code = params.get("code"),
      browser = (await cookies()).get(oauthCookie)?.value;
    if (!state || !code || !browser || params.has("error"))
      throw new Error("Invalid callback");
    const [pending] = await query(
      "DELETE FROM oauth_states WHERE state_hash=$1 AND browser_hash=$2 AND expires_at>now() RETURNING verifier_cipher",
      [hash(state), hash(browser)],
    );
    if (!pending) throw new Error("Expired state");
    const client = googleClient();
    const { tokens } = await client.getToken({
      code,
      codeVerifier: unseal(pending.verifier_cipher, `oauth:${hash(state)}`),
    });
    if (!tokens.id_token || !tokens.access_token)
      throw new Error("Incomplete authorization");
    const identity = (
      await client.verifyIdToken({
        idToken: tokens.id_token,
        audience: process.env.GOOGLE_CLIENT_ID,
      })
    ).getPayload();
    if (
      !identity?.sub ||
      !identity.email ||
      !identity.email_verified ||
      !allowedEmail(identity.email)
    )
      throw new Error("Account not allowed");
    const info = await client.getTokenInfo(tokens.access_token);
    if (!info.scopes.includes(gmailScope))
      throw new Error("Gmail permission missing");
    const [existing] = await query(
      "SELECT token_cipher FROM accounts WHERE id=$1",
      [identity.sub],
    );
    if (!tokens.refresh_token && !existing?.token_cipher)
      throw new Error("Offline access missing");
    const tokenCipher = tokens.refresh_token
      ? seal(tokens.refresh_token, `gmail:${identity.sub}`)
      : existing.token_cipher;
    await query(
      `INSERT INTO accounts(id,email,name,token_cipher,start_at) VALUES($1,$2,$3,$4,now()-interval '7 days')
      ON CONFLICT(id) DO UPDATE SET email=excluded.email,name=excluded.name,token_cipher=excluded.token_cipher,connected=true,last_error=NULL`,
      [
        identity.sub,
        identity.email.toLowerCase(),
        identity.email.endsWith("@gmail.com") ? "Personal" : "Trabajo",
        tokenCipher,
      ],
    );
    try {
      await enqueueAccount(identity.sub);
    } catch {
      await query(
        "UPDATE accounts SET last_error='La cuenta está conectada. Reintentá Sincronizar para iniciar la revisión.' WHERE id=$1",
        [identity.sub],
      );
    }
    const session = await createSession();
    const response = NextResponse.redirect(`${appUrl()}/cuentas?connected=1`);
    response.cookies.set(sessionCookie, session, {
      ...cookieOptions(),
      maxAge: 7 * 86400,
    });
    response.cookies.delete(oauthCookie);
    return response;
  } catch {
    const response = NextResponse.redirect(`${appUrl()}/?connection_error=1`);
    response.cookies.delete(oauthCookie);
    return response;
  }
}
