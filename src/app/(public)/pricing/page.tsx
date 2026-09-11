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

export const metadata = { title: "Pricing · Sotto" };
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
    <main
      id="content"
      className="mx-auto w-full max-w-[680px] px-6 py-16 md:py-24"
    >
      <h1 className="text-2xl leading-8 font-semibold">Pricing</h1>
      <p className="mt-2 text-muted-foreground">
        One plan. Three days to try it.
      </p>
      <section
        className="mt-8 rounded-md border p-6"
        aria-labelledby="plan-title"
      >
        <h2
          id="plan-title"
          className="text-[13px] font-medium text-muted-foreground"
        >
          Sotto
        </h2>
        <p className="mt-2 flex items-baseline gap-2">
          <span className="mono text-4xl leading-10 font-medium tracking-[-0.02em]">
            ${amount}
          </span>
          <span className="text-[13px] text-muted-foreground">
            per person, per month
          </span>
        </p>
        <ul className="my-6 space-y-2 text-[13px] leading-[18px]">
          {[
            "Up to two Gmail accounts",
            "A reason for every move, and an undo",
            "Your email stays in Gmail",
          ].map((line) => (
            <li key={line} className="flex items-center gap-2.5">
              <Check size={14} className="shrink-0 text-muted-foreground" />
              {line}
            </li>
          ))}
        </ul>
        {workspace?.internal ? (
          <p className="text-[13px] text-muted-foreground">
            Your installation already has access.
          </p>
        ) : !available ? (
          <>
            <Button disabled>Trial coming soon</Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Trials and payments are not enabled yet.
            </p>
          </>
        ) : !workspace ? (
          <form action="/api/google/connect" method="post">
            <Button type="submit" disabled={!configured()}>
              Connect with Google
            </Button>
            <p className="mt-3 text-xs text-muted-foreground">
              Your trial starts after you connect.
            </p>
          </form>
        ) : active ? (
          <div className="space-y-3">
            <p className="text-[13px]">
              {workspace.subscription_status === "trialing"
                ? `Trial ends ${date(workspace.trial_end)}.`
                : workspace.cancel_at_period_end
                  ? `Canceled. Access until ${date(workspace.paid_until)}.`
                  : "Subscription active."}
            </p>
            <BillingAction action="portal">Manage subscription</BillingAction>
          </div>
        ) : (
          <BillingAction action="checkout">
            {workspace.trial_used ? "Start subscription" : "Start 3-day trial"}
          </BillingAction>
        )}
        <p className="mt-5 text-xs leading-4 text-muted-foreground">
          {trialRequiresCard()
            ? "A card is required to start. After three days, Stripe charges the listed monthly price unless you cancel beforehand."
            : "No card is required for the trial. If you do not continue, it ends without a charge. Once you subscribe, billing is monthly until you cancel."}{" "}
          Applicable taxes are shown at checkout.
        </p>
      </section>
      {workspace && hosted() && !workspace.internal && (
        <div className="mt-6 space-y-3">
          {params.checkout === "success" && available && (
            <RefreshAfterCheckout />
          )}
          {!active && workspace.trial_used && (
            <p className="text-[13px] text-muted-foreground">
              Processing is paused. You can still view history, return emails,
              and disconnect accounts.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
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
      <p className="mt-8 text-[13px] leading-[18px] text-muted-foreground">
        Sotto is MIT licensed. Self-hosting needs no subscription.{" "}
        <a
          href="https://github.com/josebenitezg/sotto"
          className="underline underline-offset-2 hover:text-foreground"
        >
          GitHub
        </a>
        .
      </p>
    </main>
  );
}
