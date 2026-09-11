import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import {
  BillingAction,
  RefreshAfterCheckout,
} from "@/components/billing-action";
import { Button } from "@/components/ui/button";
import { sessionWorkspace } from "@/lib/server/auth";
import { billingReady, trialRequiresCard } from "@/lib/server/billing";
import { query } from "@/lib/server/db";
import { configured, hosted, isDemo } from "@/lib/server/config";
import { hasAccess } from "@/lib/server/entitlements";
import { workspaceAllowance } from "@/lib/server/allowances";
import { GoogleDataNotice } from "@/components/google-data-notice";
import { isPlanId, mailboxLimit, plans } from "@/lib/plans";

export const metadata = { title: "Pricing · Sotto" };
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const workspaceId = isDemo() ? null : await sessionWorkspace();
  const [workspace] = workspaceId
    ? await query(
        `SELECT w.*,
    (SELECT count(*)::int FROM accounts WHERE workspace_id=w.id AND connected=true) AS connected_accounts
    FROM workspaces w WHERE id=$1`,
        [workspaceId],
      )
    : [];
  const available = billingReady();
  const allowance = workspaceId ? await workspaceAllowance(workspaceId) : null;
  const active =
    workspace &&
    hasAccess({
      internal: workspace.internal,
      subscription_status: workspace.subscription_status,
      trial_end: workspace.trial_end,
      paid_until: workspace.paid_until,
      billing_plan: workspace.billing_plan,
      connected_accounts: workspace.connected_accounts,
    });
  const overLimit =
    workspace &&
    !workspace.internal &&
    workspace.connected_accounts > mailboxLimit(workspace.billing_plan);
  const currentPlan = isPlanId(workspace?.billing_plan)
    ? plans[workspace.billing_plan]
    : null;
  const params = await searchParams;
  const date = (value: Date) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(value) + " UTC";
  return (
    <main
      id="content"
      className="mx-auto w-full max-w-[960px] px-6 py-16 md:py-24"
    >
      {workspace || isDemo() ? (
        <Link
          href="/review"
          className="mb-6 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Back to Sotto
        </Link>
      ) : null}
      <h1 className="text-2xl leading-8 font-semibold">
        A quieter inbox. A simple plan.
      </h1>
      <p className="mt-2 text-muted-foreground">
        {workspace?.trial_used
          ? "Choose the plan that fits your inbox. Cancel anytime."
          : "Try Sotto free for 3 days. Cancel anytime."}
      </p>
      {workspace?.internal ? (
        <p className="mt-6 text-sm text-muted-foreground">
          Your installation already has access.
        </p>
      ) : workspace?.stripe_customer_id ? (
        <section
          aria-label="Your subscription"
          className="mt-6 space-y-3 rounded-md border p-5"
        >
          <p className="text-sm">
            {currentPlan ? `Sotto ${currentPlan.name}. ` : ""}
            {workspace.subscription_status === "trialing"
              ? workspace.cancel_at_period_end
                ? `Trial canceled. Access until ${date(workspace.trial_end)}. You will not be charged.`
                : `Trial ends ${date(workspace.trial_end)}. Then $${(currentPlan?.priceCents ?? 0) / 100}/month.`
              : workspace.cancel_at_period_end && workspace.paid_until
                ? `Canceled. Access until ${date(workspace.paid_until)}.`
                : active
                  ? "Subscription active."
                  : "Processing is paused. Your history, undo and disconnect remain available."}
          </p>
          {overLimit && (
            <p role="alert" className="text-sm text-destructive">
              Your plan covers {mailboxLimit(workspace.billing_plan)} Gmail
              account. Disconnect an extra account or upgrade to resume
              filtering.
            </p>
          )}
          {allowance && (
            <p className="text-sm text-muted-foreground">
              {allowance.used} / {allowance.limit} emails checked
              {allowance.trial ? " during your trial" : " this billing month"}.
              {allowance.resetsAt && (
                <>
                  {" "}
                  {workspace.cancel_at_period_end
                    ? "Included usage ends"
                    : allowance.trial
                      ? "Trial allowance ends"
                      : "Renews"}{" "}
                  {date(new Date(allowance.resetsAt))}.
                </>
              )}
              {allowance.exhausted &&
                " New filtering is paused; there are no extra charges."}
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <BillingAction action="portal" secondary>
              Manage subscription
            </BillingAction>
            <BillingAction action="refresh" secondary>
              Refresh status
            </BillingAction>
          </div>
          <p className="text-xs text-muted-foreground">
            Switch plans or cancel in Stripe. Disconnect your second account
            before moving to Solo.
          </p>
        </section>
      ) : null}
      {params.checkout === "success" && workspace && available && (
        <div className="mt-4">
          <RefreshAfterCheckout />
        </div>
      )}
      {params.checkout === "canceled" && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Checkout was canceled. No new subscription was started.
        </p>
      )}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {Object.values(plans).map((plan) => (
          <section
            key={plan.id}
            className="rounded-md border p-6"
            aria-labelledby={`plan-${plan.id}`}
          >
            <h2 id={`plan-${plan.id}`} className="text-sm font-medium">
              {plan.name}
            </h2>
            <p className="mt-3 flex items-baseline gap-2">
              <span className="mono text-4xl leading-10 font-medium tracking-[-0.02em]">
                ${plan.priceCents / 100}
              </span>
              <span className="text-[13px] text-muted-foreground">/ month</span>
            </p>
            <ul className="my-6 space-y-3 text-[13px] leading-[18px]">
              {[
                `${plan.mailboxes} Gmail account${plan.mailboxes === 1 ? "" : "s"}`,
                `${plan.emails} emails checked / month`,
                `${plan.trialEmails} emails in your 3-day trial`,
                "Automatic checks every 30 minutes",
                "A reason for every move",
                "Undo anytime in Sotto",
              ].map((line) => (
                <li key={line} className="flex items-center gap-2">
                  <Check
                    size={14}
                    className="shrink-0 text-muted-foreground"
                    aria-hidden="true"
                  />
                  {line}
                </li>
              ))}
            </ul>
            {workspace?.internal ? (
              <span className="text-xs text-muted-foreground">
                Included in your installation
              </span>
            ) : !available ? (
              <Button disabled>Coming soon</Button>
            ) : !workspace ? (
              <form action="/api/google/connect" method="post">
                <input type="hidden" name="intent" value="filter" />
                <Button type="submit" disabled={!configured()}>
                  Connect Google
                </Button>
              </form>
            ) : active || overLimit ? (
              <BillingAction action="portal" secondary>
                {workspace.billing_plan === plan.id
                  ? "Manage plan"
                  : `Switch to ${plan.name}`}
              </BillingAction>
            ) : (
              <BillingAction action="checkout" plan={plan.id}>
                {workspace.trial_used
                  ? `Choose ${plan.name}`
                  : "Start 3-day trial"}
              </BillingAction>
            )}
          </section>
        ))}
        <section
          className="rounded-md border p-6"
          aria-labelledby="plan-enterprise"
        >
          <h2 id="plan-enterprise" className="text-sm font-medium">
            Enterprise
          </h2>
          <p className="mt-3 text-2xl leading-10 font-medium">Let's talk.</p>
          <p className="my-6 text-[13px] leading-6 text-muted-foreground">
            More accounts or a busier team? Tell us what you need and we'll work
            out a plan.
          </p>
          <Button variant="outline" asChild>
            <a href="mailto:support@sotto.email?subject=Sotto%20Enterprise">
              Contact us
            </a>
          </Button>
        </section>
      </div>
      {!workspace && available && (
        <div className="mt-6 max-w-[72ch]">
          <GoogleDataNotice id="pricing-google-notice" />
        </div>
      )}
      <p className="mt-6 max-w-[72ch] text-xs leading-5 text-muted-foreground">
        {workspace?.trial_used
          ? "Your free trial has already been used. A new subscription is charged when you complete Checkout, at $5/month for Solo or $9/month for Duo. Stripe displays the charge and renewal details before you confirm."
          : trialRequiresCard()
            ? "Connect Gmail, choose a plan and add a card in Stripe. Your 3-day trial starts when Checkout is complete. Nothing is charged today. After the trial, your plan renews monthly at $5 for Solo or $9 for Duo unless you cancel before the trial ends."
            : "Connect Gmail and choose a plan to start your 3-day trial. No card is required; the trial ends without a charge unless you subscribe."}{" "}
        One trial per workspace. Prices in USD.{" "}
        <Link href="/terms" className="underline underline-offset-2">
          Subscription terms
        </Link>
        .
      </p>
      <p className="mt-3 max-w-[72ch] text-xs leading-5 text-muted-foreground">
        The allowance includes recent emails and new messages checked, whether
        kept or moved. Duo shares its allowance across both accounts. Retries
        and Undo do not use extra emails. Unused emails do not roll over. At the
        limit, new processing pauses until the next paid period; messages stay
        in Gmail and there are no overage charges.
      </p>
      {!available && (
        <p className="mt-3 text-xs text-muted-foreground">
          Payments are not open yet. Your trial has not started.
        </p>
      )}
      {hosted() && active && (
        <div className="mt-6">
          <Button asChild>
            <Link href="/review">Open Sotto</Link>
          </Button>
        </div>
      )}
      <p className="mt-8 text-[13px] text-muted-foreground">
        Sotto is open source. Self-hosting needs no subscription.{" "}
        <a
          href="https://github.com/josebenitezg/sotto"
          className="underline underline-offset-2"
        >
          GitHub
        </a>
        .
      </p>
    </main>
  );
}
