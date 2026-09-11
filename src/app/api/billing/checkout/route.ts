import { NextResponse } from "next/server";
import { checkout } from "@/lib/server/billing";
import {
  requireOrigin,
  requireSession,
  errorResponse,
  HttpError,
} from "@/lib/server/auth";
export async function POST(request: Request) {
  try {
    requireOrigin(request);
    const workspaceId = await requireSession();
    const url = (await checkout(workspaceId)) || (await checkout(workspaceId));
    if (!url) throw new HttpError(409, "Try again to open your subscription.");
    return request.headers.get("accept")?.includes("application/json")
      ? Response.json({ url })
      : NextResponse.redirect(url, 303);
  } catch (error) {
    return errorResponse(error);
  }
}
