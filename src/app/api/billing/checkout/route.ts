import { NextResponse } from "next/server";
import { checkout } from "@/lib/server/billing";
import { isPlanId } from "@/lib/plans";
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
    const body = request.headers
      .get("content-type")
      ?.includes("application/json")
      ? await request.json()
      : Object.fromEntries(await request.formData());
    if (!isPlanId(body?.plan)) throw new HttpError(400, "Choose Solo or Duo.");
    const url =
      (await checkout(workspaceId, body.plan)) ||
      (await checkout(workspaceId, body.plan));
    if (!url) throw new HttpError(409, "Try again to open your subscription.");
    return request.headers.get("accept")?.includes("application/json")
      ? Response.json({ url })
      : NextResponse.redirect(url, 303);
  } catch (error) {
    return errorResponse(error);
  }
}
