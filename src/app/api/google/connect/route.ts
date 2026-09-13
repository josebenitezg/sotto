import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { googleClient, gmailScope } from "@/lib/server/google";
import { configured, isDemo, composioEnabled } from "@/lib/server/config";
import { startComposioConnection } from "@/lib/server/composio-connect";
import { opaque, hash, seal } from "@/lib/server/crypto";
import { query } from "@/lib/server/db";
import {
  oauthCookie,
  cookieOptions,
  requireOrigin,
  errorResponse,
  HttpError,
  sessionWorkspace,
} from "@/lib/server/auth";
export async function POST(request: Request) {
  try {
    if (!configured() || isDemo())
      throw new HttpError(503, "The Google connection is not configured yet.");
    requireOrigin(request);
    const body = await request.text();
    if (body.length > 1024)
      throw new HttpError(413, "The request is too large.");
    const startFiltering = new URLSearchParams(body).get("intent") === "filter";
    if (composioEnabled()) return await startComposioConnection(startFiltering);
    const state = opaque(),
      browser = opaque(),
      verifier = opaque();
    await query(
      "INSERT INTO oauth_states(state_hash,verifier_cipher,browser_hash,expires_at,workspace_id,start_filtering) VALUES($1,$2,$3,now()+interval '10 minutes',$4,$5)",
      [
        hash(state),
        seal(verifier, `oauth:${hash(state)}`),
        hash(browser),
        await sessionWorkspace(),
        startFiltering,
      ],
    );
    const url = new URL(
      googleClient().generateAuthUrl({
        access_type: "offline",
        prompt: "consent select_account",
        scope: ["openid", "email", "profile", gmailScope],
        state,
        code_challenge: createHash("sha256")
          .update(verifier)
          .digest("base64url"),
        code_challenge_method: "S256" as never,
      }),
    );
    url.searchParams.set("hl", "en");
    const response = NextResponse.redirect(url, 303);
    response.cookies.set(oauthCookie, browser, {
      ...cookieOptions(),
      maxAge: 600,
    });
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
