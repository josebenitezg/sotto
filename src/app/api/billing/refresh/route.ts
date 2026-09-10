import { NextResponse } from "next/server";
import { refreshBilling } from "@/lib/server/billing";
import { appUrl } from "@/lib/server/config";
import {
  requireOrigin,
  requireSession,
  errorResponse,
} from "@/lib/server/auth";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    await refreshBilling(await requireSession());
    return request.headers.get("accept")?.includes("application/json")
      ? Response.json({ ok: true })
      : NextResponse.redirect(`${appUrl()}/planes`, 303);
  } catch (error) {
    return errorResponse(error);
  }
}
