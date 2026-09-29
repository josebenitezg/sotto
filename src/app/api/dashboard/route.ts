import { dashboard } from "@/lib/server/dashboard";
import { errorResponse, sessionWorkspace } from "@/lib/server/auth";
import { after } from "next/server";
import { recoverInitialSync } from "@/lib/server/initial-sync";
export async function GET() {
  try {
    const data = await dashboard();
    if (
      data.authenticated &&
      !data.demo &&
      data.accessActive &&
      data.accounts.some(
        (account) =>
          account.connected &&
          account.mode !== "paused" &&
          !account.lastSync &&
          account.policy.processingLocation !== "desktop",
      )
    ) {
      const workspaceId = await sessionWorkspace();
      if (workspaceId) after(() => recoverInitialSync(workspaceId));
    }
    return Response.json(data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
