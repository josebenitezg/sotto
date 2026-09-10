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
} from "@/lib/server/auth";
export async function POST(request: Request) {
  try {
    if (!configured() || isDemo())
      throw new HttpError(
        503,
        "La conexión con Google todavía no está configurada.",
      );
    requireOrigin(request);
    const state = opaque(),
      browser = opaque(),
      verifier = opaque();
    await query(
      "INSERT INTO oauth_states(state_hash,verifier_cipher,browser_hash,expires_at) VALUES($1,$2,$3,now()+interval '10 minutes')",
      [hash(state), seal(verifier, `oauth:${hash(state)}`), hash(browser)],
    );
    const url = googleClient().generateAuthUrl({
      access_type: "offline",
      prompt: "consent select_account",
      scope: ["openid", "email", "profile", gmailScope],
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256" as never,
    });
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
