import { NextResponse } from "next/server";
import {
  errorResponse,
  requireOrigin,
  requireSession,
} from "@/lib/server/auth";
import { appUrl } from "@/lib/server/config";
import {
  requireDesktop,
  desktopReturnCookie,
} from "@/lib/server/desktop-config";
import { approvePairing } from "@/lib/server/desktop-pairing";
export async function POST(request: Request) {
  try {
    requireDesktop();
    requireOrigin(request);
    const workspace = await requireSession();
    const form = await request.formData();
    await approvePairing(
      String(form.get("id")),
      workspace,
      String(form.get("code")),
    );
    const response = NextResponse.redirect(
      `${appUrl()}/desktop/connect?approved=1`,
      303,
    );
    response.cookies.delete(desktopReturnCookie);
    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
