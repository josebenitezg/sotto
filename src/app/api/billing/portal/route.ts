import { NextResponse } from "next/server";
import { portal } from "@/lib/server/billing";
import {
  requireOrigin,
  requireSession,
  errorResponse,
} from "@/lib/server/auth";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const url = await portal(await requireSession());
    return request.headers.get("accept")?.includes("application/json")
      ? Response.json({ url })
      : NextResponse.redirect(url, 303);
  } catch (error) {
    return errorResponse(error);
  }
}
