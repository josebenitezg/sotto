import Link from "next/link";
import { Check } from "lucide-react";
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

export default async function PlansPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  const workspaceId = isDemo() ? null : await sessionWorkspace();
  const [workspace] = workspaceId
    ? await query("SELECT * FROM workspaces WHERE id=$1", [workspaceId])
    : [];
  const available = billingReady();
  const active =
    workspace &&
    hasAccess({
      internal: workspace.internal,
      subscription_status: workspace.subscription_status,
      trial_end: workspace.trial_end,
      paid_until: workspace.paid_until,
    });
  const amount = Number(process.env.PLAN_PRICE_CENTS || "900") / 100;
  const params = await searchParams;
  const date = (value: Date) =>
    new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(value) + " UTC";
  return (
    <main id="content" className="public-document space-y-8">
      <div>
        <h1 className="text-[28px] leading-8 font-semibold tracking-tight">
          Less noise. One simple plan.
        </h1>
        <p className="mt-3 max-w-[58ch] text-sm leading-6 text-muted-foreground">
          Try Sotto for three days. Keep using Gmail, with sales pitches set
          aside and every decision in view.
        </p>
      </div>
      <section
        className="rounded-xl border bg-card p-6 md:p-8"
        aria-labelledby="plan-title"
      >
        <h2 id="plan-title" className="text-base font-semibold">
          Sotto
        </h2>
        <p className="mt-4">
          <span className="text-4xl font-semibold tracking-tight">
            US${amount}
          </span>
          <span className="ml-2 text-sm text-muted-foreground">
            per person, per month
          </span>
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          A three-day trial. Up to two Gmail accounts.
        </p>
        <ul className="my-7 space-y-3 text-sm">
          {[
            "AI that considers the message and your preferences",
            "Work and personal accounts in one workspace",
            "A reason for every decision and an option to undo",
            "Your email stays in Gmail",
          ].map((line) => (
            <li key={line} className="flex gap-3">
              <Check size={17} className="mt-0.5 shrink-0 text-primary" />
              {line}
            </li>
          ))}
        </ul>
        {workspace?.internal ? (
          <p className="text-sm text-muted-foreground">
            Your personal installation already has access. No subscription is
            needed.
          </p>
        ) : !available ? (
          <>
            <Button size="lg" disabled>
              Free trial coming soon
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">
              We are finishing the setup. Trials and payments are not enabled
              yet.
            </p>
          </>
        ) : !workspace ? (
          <form action="/api/google/connect" method="post">
            <Button type="submit" size="lg" disabled={!configured()}>
              Connect with Google
            </Button>
            <p className="mt-3 text-sm text-muted-foreground">
              Connect Gmail first. Your trial starts when you activate it in the
              next step.
            </p>
          </form>
        ) : active ? (
          <div className="space-y-4">
            <p className="text-sm">
              {workspace.subscription_status === "trialing"
                ? `Your trial ends on ${date(workspace.trial_end)}.`
                : workspace.cancel_at_period_end
                  ? `Your plan is canceled. You keep access until ${date(workspace.paid_until)}.`
                  : "Your subscription is active."}
            </p>
            <BillingAction action="portal">Manage subscription</BillingAction>
          </div>
        ) : (
          <BillingAction action="checkout">
            {workspace.trial_used
              ? "Start subscription"
              : "Start my 3-day trial"}
          </BillingAction>
        )}
        <p className="mt-5 text-xs leading-5 text-muted-foreground">
          {trialRequiresCard()
            ? "A card is required to start. After three days, Stripe charges the listed monthly price unless you cancel beforehand."
            : "No card is required for the trial. If you do not continue, it ends without a charge. Once you subscribe, billing is monthly until you cancel."}{" "}
          Applicable taxes are shown at checkout.
        </p>
      </section>
      {workspace && hosted() && !workspace.internal && (
        <div className="space-y-4">
          {params.checkout === "success" && available && (
            <RefreshAfterCheckout />
          )}
          {!active && workspace.trial_used && (
            <p className="text-sm text-muted-foreground">
              Processing is paused. You can still view your history, return
              emails to your inbox, and disconnect your accounts.
            </p>
          )}
          <div className="flex flex-wrap gap-3">
            <BillingAction action="refresh" secondary>
              Refresh status
            </BillingAction>
            {workspace.stripe_customer_id && !active && (
              <BillingAction action="portal" secondary>
                Manage payments
              </BillingAction>
            )}
          </div>
        </div>
      )}
      <section className="space-y-3 text-sm leading-6 text-muted-foreground">
        <h2 className="font-semibold text-foreground">
          You can host it yourself, too.
        </h2>
        <p>
          Sotto is open source under the MIT license. Self-hosting does not
          require this subscription; you use your own infrastructure and AI
          provider.
        </p>
        <a
          href="https://github.com/josebenitezg/sotto"
          className="text-primary underline underline-offset-4"
        >
          View the project on GitHub
        </a>
      </section>
      <p className="text-xs text-muted-foreground">
        <Link className="underline underline-offset-4" href="/privacy">
          Privacy and your data
        </Link>
      </p>
    </main>
  );
}
