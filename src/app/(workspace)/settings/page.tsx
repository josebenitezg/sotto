import Link from "next/link";
import { BillingAction } from "@/components/billing-action";
import { Button } from "@/components/ui/button";
import { SettingsPage } from "@/components/workspace";
import { isPlanId, plans } from "@/lib/plans";
import { sessionWorkspace } from "@/lib/server/auth";
import { hosted, isDemo } from "@/lib/server/config";
import { query } from "@/lib/server/db";

export default async function Page() {
  const workspaceId = hosted() && !isDemo() ? await sessionWorkspace() : null;
  const [workspace] = workspaceId
    ? await query(
        `SELECT internal,sotto_full_access(email) AS full_access,
          stripe_customer_id,stripe_subscription_id,billing_plan,
          subscription_status,cancel_at_period_end
        FROM workspaces WHERE id=$1`,
        [workspaceId],
      )
    : [];
  const plan = isPlanId(workspace?.billing_plan)
    ? plans[workspace.billing_plan]
    : null;
  const included = workspace?.internal || workspace?.full_access;
  const subscription = workspace ? (
    <section aria-labelledby="subscription-heading" className="mb-10">
      <h2
        id="subscription-heading"
        className="mb-3 text-[13px] leading-[18px] font-medium text-muted-foreground"
      >
        Subscription
      </h2>
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-md border p-4">
        <div className="space-y-1 text-[13px] leading-5">
          <p className="font-medium">
            {workspace.stripe_subscription_id && plan
              ? `Sotto ${plan.name} · $${plan.priceCents / 100}/month`
              : included
                ? "Full access"
                : "No subscription yet"}
          </p>
          <p className="max-w-[50ch] text-muted-foreground">
            {workspace.stripe_customer_id
              ? workspace.subscription_status === "canceled"
                ? "Subscription canceled. Your invoices are still available in Stripe."
                : workspace.cancel_at_period_end
                  ? "Renewal canceled. Access continues until your current period ends."
                  : workspace.subscription_status === "trialing"
                    ? "Free trial. Cancel before it ends to avoid a charge."
                    : "Manage payments or cancel in Stripe. Canceling stops your next renewal."
              : included
                ? "No subscription required."
                : "Choose a plan to start filtering your inbox."}
          </p>
        </div>
        {workspace.stripe_customer_id ? (
          <BillingAction action="portal" secondary>
            Manage or cancel subscription
          </BillingAction>
        ) : !included ? (
          <Button asChild variant="outline">
            <Link href="/pricing">View plans</Link>
          </Button>
        ) : null}
      </div>
    </section>
  ) : undefined;
  return <SettingsPage subscription={subscription} />;
}
