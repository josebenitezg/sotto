import Link from "next/link";
import { redirect } from "next/navigation";
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
import { GoogleDataNotice } from "@/components/google-data-notice";
import { isPlanId, mailboxLimit, plans } from "@/lib/plans";
import { cn } from "@/lib/utils";

export const metadata = { title: "Pricing · Sotto" };
export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const workspaceId = isDemo() ? null : await sessionWorkspace();
  const [workspace] = workspaceId
    ? await query(
        `SELECT w.*,sotto_full_access(w.email) AS full_access,
    (SELECT count(*)::int FROM accounts WHERE workspace_id=w.id AND connected=true) AS connected_accounts
    FROM workspaces w WHERE id=$1`,
        [workspaceId],
      )
    : [];
  const available = billingReady();
  const active =
    workspace &&
    hasAccess({
      internal: workspace.internal,
      full_access: workspace.full_access,
      subscription_status: workspace.subscription_status,
      trial_end: workspace.trial_end,
      paid_until: workspace.paid_until,
      billing_plan: workspace.billing_plan,
      connected_accounts: workspace.connected_accounts,
    });
  const overLimit =
    workspace &&
    !workspace.internal &&
    !workspace.full_access &&
    workspace.connected_accounts > mailboxLimit(workspace.billing_plan);
  const currentPlan = isPlanId(workspace?.billing_plan)
    ? plans[workspace.billing_plan]
    : null;
  // Plan ownership is independent of complimentary access and mailbox limits.
  const subscriptionActive =
    !!workspace?.stripe_subscription_id &&
    hasAccess({
      subscription_status: workspace.subscription_status,
      trial_end: workspace.trial_end,
      paid_until: workspace.paid_until,
    });
  const params = await searchParams;
  if (params.checkout === "success") {
    if (!workspace) redirect("/login");
    return (
      <main
        id="content"
        className="mx-auto flex min-h-[65svh] w-full max-w-[560px] flex-col items-start justify-center px-6 py-16"
      >
        {subscriptionActive && (
          <div className="mb-6 flex size-10 items-center justify-center rounded-full bg-foreground text-background">
            <Check size={20} aria-hidden="true" />
          </div>
        )}
        <h1 className="text-3xl leading-10 font-semibold">Thank you</h1>
        {subscriptionActive && (
          <p className="mt-3 text-muted-foreground">
            {workspace.subscription_status === "trialing"
              ? `Your ${currentPlan?.name ?? "Sotto"} trial is ready.`
              : `Your ${currentPlan?.name ?? "Sotto"} plan is active.`}
          </p>
        )}
        {available && (
          <div className="mt-3">
            <RefreshAfterCheckout confirmed={subscriptionActive} />
          </div>
        )}
        <Button asChild size="lg" className="mt-8">
          <Link href="/accounts">Manage my accounts</Link>
        </Button>
      </main>
    );
  }
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
      <h1 className="text-2xl leading-8 font-semibold">Pricing</h1>
      <p className="mt-2 text-muted-foreground">
        {workspace?.internal || workspace?.full_access
          ? "Full access is enabled. No subscription is needed."
          : subscriptionActive && currentPlan
            ? `Sotto ${currentPlan.name} is your current plan. Manage it in Settings.`
            : workspace?.trial_used
              ? "Choose the plan that fits your inbox. Cancel anytime."
              : "Try Sotto free for 3 days. Cancel anytime."}
      </p>
      {overLimit && (
        <p role="alert" className="mt-4 text-[13px] text-destructive">
          Your plan covers {mailboxLimit(workspace.billing_plan)} Gmail account.
          Disconnect an extra account or switch to Duo to resume filtering.
        </p>
      )}
      {params.checkout === "canceled" && (
        <p role="status" className="mt-4 text-sm text-muted-foreground">
          Checkout was canceled. No new subscription was started.
        </p>
      )}
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {Object.values(plans).map((plan) => {
          const isCurrent = subscriptionActive && currentPlan?.id === plan.id;
          return (
            <section
              key={plan.id}
              className={cn(
                "rounded-md border p-6",
                isCurrent && "border-foreground",
              )}
              aria-labelledby={`plan-${plan.id}`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 id={`plan-${plan.id}`} className="text-sm font-medium">
                  {plan.name}
                </h2>
                {isCurrent && (
                  <span className="rounded-full bg-foreground px-2 py-1 text-[11px] font-medium text-background">
                    Current plan
                  </span>
                )}
              </div>
              <p className="mt-3 flex items-baseline gap-2">
                <span className="mono text-4xl leading-10 font-medium tracking-[-0.02em]">
                  ${plan.priceCents / 100}
                </span>
                <span className="text-[13px] text-muted-foreground">
                  / month
                </span>
              </p>
              <ul className="my-6 space-y-3 text-[13px] leading-[18px]">
                {[
                  `${plan.mailboxes} Gmail account${plan.mailboxes === 1 ? "" : "s"}`,
                  `${plan.emails} emails checked / month`,
                  `${plan.trialEmails} emails in your 3-day trial`,
                  `Automatic checks every ${process.env.COMPOSIO_NOTIFICATION_MODE === "poll" ? 30 : 15} minutes`,
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
              {workspace?.internal || workspace?.full_access ? (
                <span className="text-xs text-muted-foreground">
                  {workspace?.full_access
                    ? "Included in your full access"
                    : "Included in your installation"}
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
          );
        })}
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
        {workspace?.full_access
          ? "Your full access is enabled. No trial is needed."
          : workspace?.trial_used
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
