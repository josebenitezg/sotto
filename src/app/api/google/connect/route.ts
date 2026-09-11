import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { googleClient, gmailScope } from "@/lib/server/google";
import { configured, isDemo } from "@/lib/server/config";
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
    const state = opaque(),
      browser = opaque(),
      verifier = opaque();
    await query(
      "INSERT INTO oauth_states(state_hash,verifier_cipher,browser_hash,expires_at,workspace_id) VALUES($1,$2,$3,now()+interval '10 minutes',$4)",
      [
        hash(state),
        seal(verifier, `oauth:${hash(state)}`),
        hash(browser),
        await sessionWorkspace(),
      ],
    );
    const url = new URL(
      googleClient().generateAuthUrl({
        access_type: "offline",
        prompt: "consent select_account",
        scope: ["openid", "email", gmailScope],
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
