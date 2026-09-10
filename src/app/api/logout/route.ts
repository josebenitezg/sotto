import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { requireOrigin, sessionCookie, errorResponse } from "@/lib/server/auth";
import { appUrl } from "@/lib/server/config";
import { hash } from "@/lib/server/crypto";
import { query } from "@/lib/server/db";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const token = (await cookies()).get(sessionCookie)?.value;
    if (token)
      await query("DELETE FROM sessions WHERE token_hash=$1", [hash(token)]);
    const response = NextResponse.redirect(appUrl(), 303);
    response.cookies.delete(sessionCookie);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
