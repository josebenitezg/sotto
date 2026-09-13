import Link from "next/link";
import { BillingAction } from "@/components/billing-action";
import { Button } from "@/components/ui/button";
import { SectionLabel, SettingsPage } from "@/components/workspace";
import { isPlanId, mailboxLimit, plans } from "@/lib/plans";
import { sessionWorkspace } from "@/lib/server/auth";
import { workspaceAllowance } from "@/lib/server/allowances";
import { hosted, isDemo } from "@/lib/server/config";
import { query } from "@/lib/server/db";
import { hasAccess, type Entitlement } from "@/lib/server/entitlements";

const date = (value: Date | string | null) =>
  value
    ? new Intl.DateTimeFormat("en-US", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "UTC",
      }).format(new Date(value)) + " UTC"
    : "soon";

export const metadata = { title: "Settings · Sotto" };
export default async function Page() {
  const workspaceId = hosted() && !isDemo() ? await sessionWorkspace() : null;
  const [[workspace], allowance] = workspaceId
    ? await Promise.all([
        query<
          Entitlement & {
            stripe_customer_id: string | null;
            stripe_subscription_id: string | null;
            cancel_at_period_end: boolean;
          }
        >(
          `SELECT w.internal,sotto_full_access(w.email) AS full_access,
          w.stripe_customer_id,w.stripe_subscription_id,w.billing_plan,
          w.subscription_status,w.cancel_at_period_end,w.trial_end,w.paid_until,
          (SELECT count(*)::int FROM accounts WHERE workspace_id=w.id AND connected=true) AS connected_accounts
        FROM workspaces w WHERE w.id=$1`,
          [workspaceId],
        ),
        workspaceAllowance(workspaceId),
      ])
    : [[], null];
  const plan = isPlanId(workspace?.billing_plan)
    ? plans[workspace.billing_plan]
    : null;
  const included = workspace?.internal || workspace?.full_access;
  const active = workspace && hasAccess(workspace);
  const overLimit =
    workspace &&
    !included &&
    (workspace.connected_accounts ?? 0) > mailboxLimit(workspace.billing_plan);
  const status = !workspace
    ? ""
    : !workspace.stripe_customer_id
      ? included
        ? "No subscription required."
        : "Choose a plan to start filtering your inbox."
      : workspace.subscription_status === "trialing"
        ? workspace.cancel_at_period_end
          ? `Trial canceled. Access until ${date(workspace.trial_end)}. You will not be charged.`
          : `Trial ends ${date(workspace.trial_end)}. Then $${(plan?.priceCents ?? 0) / 100}/month.`
        : workspace.subscription_status === "canceled"
          ? "Subscription canceled. Invoices stay available in Stripe."
          : workspace.cancel_at_period_end && workspace.paid_until
            ? `Canceled. Access until ${date(workspace.paid_until)}.`
            : included
              ? "Full access is enabled. Manage any existing Stripe subscription below."
              : active
                ? `Renews monthly. ${
                    workspace.paid_until
                      ? `Next renewal ${date(workspace.paid_until)}.`
                      : ""
                  }`
                : "Processing is paused. Your history, Undo and Disconnect remain available.";
  const subscription = workspace ? (
    <section aria-labelledby="subscription-heading" className="mb-12">
      <SectionLabel id="subscription-heading">Subscription</SectionLabel>
      <div className="space-y-4 rounded-md border p-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 text-small">
            <p className="font-medium">
              {workspace.stripe_subscription_id && plan
                ? `Sotto ${plan.name} · $${plan.priceCents / 100}/month`
                : included
                  ? "Full access"
                  : "No subscription yet"}
            </p>
            <p className="max-w-[56ch] text-muted-foreground">{status}</p>
            {active && allowance && (
              <p className="mono text-xs text-muted-foreground">
                {allowance.used} / {allowance.limit} emails checked
                {allowance.trial ? " during your trial" : " this month"}
                {allowance.resetsAt
                  ? ` · ${
                      workspace.cancel_at_period_end
                        ? "Ends"
                        : allowance.trial
                          ? "Trial ends"
                          : "Renews"
                    } ${date(allowance.resetsAt)}`
                  : ""}
                {allowance.exhausted ? " · New filtering paused" : ""}
              </p>
            )}
          </div>
          <Link
            href="/pricing"
            className="text-small text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            {workspace.stripe_subscription_id ? "Change plan" : "View plans"}
          </Link>
        </div>
        {overLimit && (
          <p role="alert" className="text-small text-destructive">
            Your plan covers {mailboxLimit(workspace.billing_plan)} Gmail
            account. Disconnect an extra account or change plan to resume
            filtering.
          </p>
        )}
        {workspace.stripe_customer_id ? (
          <div className="flex flex-wrap gap-2">
            <BillingAction action="portal" secondary>
              Manage subscription
            </BillingAction>
            <BillingAction action="refresh" secondary>
              Refresh status
            </BillingAction>
          </div>
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
