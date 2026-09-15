import { cookies } from "next/headers";
import { z } from "zod";
import {
  requireOrigin,
  requireSession,
  errorResponse,
  HttpError,
  sessionCookie,
} from "@/lib/server/auth";
import { hash } from "@/lib/server/crypto";
import { query } from "@/lib/server/db";
import { requireDesktop } from "@/lib/server/desktop-config";
import { dashboard } from "@/lib/server/dashboard";
import { hosted } from "@/lib/server/config";
import { TRIAL_DAYS, trialRequiresCard } from "@/lib/server/billing";
import { plans } from "@/lib/plans";
import {
  enableDesktop,
  claimDesktop,
  completeDesktop,
  failDesktop,
} from "@/lib/server/desktop-work";
export const maxDuration = 60;
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("overview") }),
  z.object({ action: z.literal("signout") }),
  z.object({
    action: z.literal("enable"),
    accountId: z.string().max(255),
    mode: z.enum(["review", "automatic", "paused"]),
  }),
  z.object({ action: z.literal("claim"), accountId: z.string().max(255) }),
  z.object({ action: z.literal("fail"), id: z.uuid() }),
  z.object({
    action: z.literal("complete"),
    id: z.uuid(),
    result: z.unknown(),
  }),
]);
export async function POST(request: Request) {
  try {
    requireDesktop();
    requireOrigin(request);
    const workspace = await requireSession();
    const device = hash((await cookies()).get(sessionCookie)!.value);
    const raw = await request.text();
    if (raw.length > 16000) throw new HttpError(413, "Request too large.");
    let json;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "Invalid desktop request.");
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new HttpError(400, "Invalid desktop request.");
    const body = parsed.data;
    let result: unknown;
    if (body.action === "overview") {
      const [billing] = await query(
        "SELECT billing_plan,subscription_status,trial_end,paid_until,cancel_at_period_end,stripe_customer_id IS NOT NULL AS has_customer,stripe_subscription_id IS NOT NULL AND subscription_status NOT IN ('canceled','incomplete_expired','none') AS has_subscription,internal OR sotto_full_access(email) AS included FROM workspaces WHERE id=$1",
        [workspace],
      );
      const localAccounts = await query(
        "SELECT a.id,a.email,a.mode,d.device_hash=$2 AS this_device FROM accounts a JOIN desktop_accounts d ON d.account_id=a.id WHERE a.workspace_id=$1 AND d.enabled=true AND a.connected=true",
        [workspace, device],
      );
      result = {
        dashboard: await dashboard(),
        billing: {
          ...billing,
          included: !hosted() || billing.included,
          trialDays: TRIAL_DAYS,
          trialRequiresCard: trialRequiresCard(),
        },
        plans: Object.values(plans),
        localAccounts: localAccounts.filter((a) => a.this_device),
        allLocalAccounts: localAccounts,
      };
    } else if (body.action === "enable")
      result = await enableDesktop(
        workspace,
        device,
        body.accountId,
        body.mode,
      );
    else if (body.action === "claim")
      result = await claimDesktop(workspace, device, body.accountId);
    else if (body.action === "fail")
      result = await failDesktop(workspace, device, body.id);
    else if (body.action === "complete")
      result = await completeDesktop(workspace, device, body.id, body.result);
    else {
      await query(
        "DELETE FROM sessions WHERE token_hash=$1 AND workspace_id=$2",
        [device, workspace],
      );
      result = { ok: true };
    }
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
