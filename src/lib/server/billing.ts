import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import {
  appUrl,
  configured,
  hosted,
  isDemo,
  required,
  composioEnabled,
} from "./config";
import { HttpError } from "./auth";
import { query, transaction } from "./db";
import { hasAccess } from "./entitlements";
import { enqueueAccount } from "./queue";
import { isPlanId, plans, type PlanId } from "../plans";

export function priceId(plan: PlanId) {
  return required(
    plan === "solo" ? "STRIPE_PRICE_SOLO_ID" : "STRIPE_PRICE_DUO_ID",
  );
}
function planForPrice(id: string): PlanId | undefined {
  return (Object.keys(plans) as PlanId[]).find((plan) => priceId(plan) === id);
}

export const TRIAL_DAYS = 3;
export const trialRequiresCard = () =>
  process.env.TRIAL_REQUIRE_CARD === "true";
export const billingReady = () =>
  hosted() &&
  !isDemo() &&
  configured() &&
  process.env.CHECKOUT_ENABLED === "true" &&
  (!composioEnabled() ||
    (process.env.COMPOSIO_NOTIFICATION_MODE === "poll" &&
      process.env.COMPOSIO_POLLING_READY === "true") ||
    (process.env.COMPOSIO_NOTIFICATION_MODE === "trigger" &&
      process.env.COMPOSIO_TRIGGERS_READY === "true")) &&
  [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_SOLO_ID",
    "STRIPE_PRICE_DUO_ID",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PORTAL_CONFIGURATION_ID",
  ].every((key) => !!process.env[key]?.trim());

export function stripe() {
  const key = required("STRIPE_SECRET_KEY");
  const live = process.env.STRIPE_MODE === "live";
  if (
    !key.startsWith(live ? "sk_live_" : "sk_test_") &&
    !key.startsWith(live ? "rk_live_" : "rk_test_")
  )
    throw new Error("Stripe key and mode do not match");
  return new Stripe(key, { timeout: 10000, maxNetworkRetries: 1 });
}

export function checkoutParameters(
  workspaceId: string,
  customer: string,
  trialUsed: boolean,
  plan: PlanId = "duo",
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "subscription",
    customer,
    client_reference_id: workspaceId,
    line_items: [{ price: priceId(plan), quantity: 1 }],
    payment_method_collection:
      trialUsed || trialRequiresCard() ? "always" : "if_required",
    payment_method_types: ["card"],
    custom_text: {
      submit: {
        message: `${plans[plan].emails} checked emails per monthly billing period${trialUsed ? "" : `; the 3-day trial includes ${plans[plan].trialEmails}`}. No overage charges. New processing pauses at the limit. Allowances are shared across connected accounts and do not roll over.`,
      },
    },
    subscription_data: {
      metadata: { sotto_workspace_id: workspaceId, application: "sotto", plan },
      ...(trialUsed
        ? {}
        : {
            trial_period_days: TRIAL_DAYS,
            trial_settings: {
              end_behavior: { missing_payment_method: "cancel" as const },
            },
          }),
    },
    metadata: { sotto_workspace_id: workspaceId, application: "sotto", plan },
    success_url: `${appUrl()}/pricing?checkout=success`,
    cancel_url: `${appUrl()}/pricing?checkout=canceled`,
    locale: "en",
  };
}

function serviceAvailable() {
  if (!billingReady())
    throw new HttpError(
      503,
      "We are finishing the setup. Your trial has not started yet.",
    );
}

export async function checkout(workspaceId: string, plan: PlanId = "duo") {
  serviceAvailable();
  if (!isPlanId(plan)) throw new HttpError(400, "Choose Solo or Duo.");
  // Persist the idempotency key before provider calls. A timeout or database
  // failure can then be retried without creating a second Checkout Session.
  await query(
    "UPDATE workspaces SET checkout_attempt=$2,checkout_plan=$3 WHERE id=$1 AND checkout_attempt IS NULL",
    [workspaceId, randomUUID(), plan],
  );
  return transaction(async (db) => {
    const {
      rows: [workspace],
    } = await db.query("SELECT * FROM workspaces WHERE id=$1 FOR UPDATE", [
      workspaceId,
    ]);
    if (!workspace || workspace.internal)
      throw new HttpError(409, "This workspace does not need a subscription.");
    const {
      rows: [account],
    } = await db.query(
      "SELECT count(*)::int AS count FROM accounts WHERE workspace_id=$1 AND connected=true",
      [workspaceId],
    );
    if (!account?.count)
      throw new HttpError(409, "Connect Gmail before starting your trial.");
    if (account.count > plans[plan].mailboxes)
      throw new HttpError(
        409,
        "Disconnect an extra Gmail account before choosing Solo.",
      );
    const api = stripe();
    const price = await api.prices.retrieve(priceId(plan));
    if (
      !price.active ||
      price.currency !== "usd" ||
      price.unit_amount !== plans[plan].priceCents ||
      price.recurring?.interval !== "month" ||
      price.recurring.interval_count !== 1
    )
      throw new Error("Stripe price does not match the published monthly plan");
    const customer =
      workspace.stripe_customer_id ||
      (
        await api.customers.create(
          {
            email: workspace.email,
            metadata: { sotto_workspace_id: workspaceId, application: "sotto" },
          },
          { idempotencyKey: `sotto:customer:${workspaceId}` },
        )
      ).id;
    await db.query("UPDATE workspaces SET stripe_customer_id=$2 WHERE id=$1", [
      workspaceId,
      customer,
    ]);
    const existing = await api.subscriptions.list({
      customer,
      status: "all",
      limit: 100,
    });
    if (existing.has_more)
      throw new Error("Subscription list requires reconciliation");
    const ours = existing.data.filter(
      (s) =>
        s.metadata.application === "sotto" &&
        s.metadata.sotto_workspace_id === workspaceId,
    );
    if (
      ours.some((s) => !["canceled", "incomplete_expired"].includes(s.status))
    )
      return (
        await api.billingPortal.sessions.create({
          customer,
          configuration: required("STRIPE_PORTAL_CONFIGURATION_ID"),
          locale: "en",
          return_url: `${appUrl()}/pricing`,
        })
      ).url;
    // Provider history also prevents another trial if the completion webhook
    // was temporarily unavailable or an old browser retries an expired trial.
    const trialUsed = workspace.trial_used || ours.some((s) => !!s.trial_start);
    if (workspace.checkout_id) {
      const previous = await api.checkout.sessions.retrieve(
        workspace.checkout_id,
      );
      if (
        previous.status === "open" &&
        previous.url &&
        workspace.checkout_plan === plan
      )
        return previous.url;
      if (previous.status === "open")
        await api.checkout.sessions.expire(previous.id);
      // Save the next key outside this transaction before a later retry.
      await db.query(
        "UPDATE workspaces SET checkout_id=NULL,checkout_url=NULL,checkout_expires=NULL,checkout_attempt=NULL,checkout_plan=NULL WHERE id=$1",
        [workspaceId],
      );
      return null;
    }
    // An earlier provider call may have succeeded before its database save
    // failed. Recover the same plan first so retries keep identical parameters.
    const attemptPlan = isPlanId(workspace.checkout_plan)
      ? workspace.checkout_plan
      : "duo";
    const session = await api.checkout.sessions.create(
      checkoutParameters(workspaceId, customer, trialUsed, attemptPlan),
      {
        idempotencyKey: `sotto:checkout:${workspaceId}:${workspace.checkout_attempt}`,
      },
    );
    if (!session.url) throw new Error("Checkout URL missing");
    if (attemptPlan !== plan) {
      const recovered = await api.checkout.sessions.retrieve(session.id);
      if (recovered.status === "open")
        await api.checkout.sessions.expire(recovered.id);
      if (recovered.status === "complete")
        throw new HttpError(
          409,
          "Your previous checkout is complete. Refresh your subscription status.",
        );
      await db.query(
        "UPDATE workspaces SET checkout_id=NULL,checkout_url=NULL,checkout_expires=NULL,checkout_attempt=NULL,checkout_plan=NULL WHERE id=$1",
        [workspaceId],
      );
      return null;
    }
    await db.query(
      "UPDATE workspaces SET checkout_id=$2,checkout_url=$3,checkout_expires=$4,trial_used=$5,checkout_plan=$6 WHERE id=$1",
      [
        workspaceId,
        session.id,
        session.url,
        new Date(session.expires_at * 1000),
        trialUsed,
        plan,
      ],
    );
    return session.url;
  });
}

export async function portal(workspaceId: string) {
  if (!hosted() || isDemo())
    throw new HttpError(404, "Billing is not enabled for this installation.");
  const [workspace] = await query(
    "SELECT stripe_customer_id FROM workspaces WHERE id=$1",
    [workspaceId],
  );
  if (!workspace?.stripe_customer_id)
    throw new HttpError(409, "You do not have a subscription yet.");
  return (
    await stripe().billingPortal.sessions.create({
      customer: workspace.stripe_customer_id,
      configuration: required("STRIPE_PORTAL_CONFIGURATION_ID"),
      locale: "en",
      return_url: `${appUrl()}/pricing`,
    })
  ).url;
}

// Fetch current Stripe state while holding the workspace lock: delayed,
// duplicated or reordered events cannot replay an obsolete subscription state.
export async function reconcileCustomer(customerId: string) {
  return transaction(async (db) => {
    const {
      rows: [workspace],
    } = await db.query(
      "SELECT * FROM workspaces WHERE stripe_customer_id=$1 FOR UPDATE",
      [customerId],
    );
    if (!workspace) return null;
    const subscriptions = await stripe().subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 100,
      expand: ["data.latest_invoice"],
    });
    if (subscriptions.has_more)
      throw new Error("Subscription list requires pagination");
    const ours = subscriptions.data.filter(
      (s) =>
        s.metadata.application === "sotto" &&
        s.metadata.sotto_workspace_id === workspace.id,
    );
    const subscription = ours.sort((a, b) => b.created - a.created)[0];
    if (!subscription) return null;
    const items = subscription.items.data;
    const plan =
      items.length === 1 ? planForPrice(items[0].price.id) : undefined;
    if (items.length !== 1 || !plan || items[0].quantity !== 1)
      throw new Error("Unexpected subscription product");
    const invoice =
      typeof subscription.latest_invoice === "object"
        ? subscription.latest_invoice
        : null;
    // Customer Portal can set cancel_at without cancel_at_period_end (including
    // flexible subscriptions). Enforce that deadline even if its webhook is late.
    const periodEnd = Math.min(
      items[0].current_period_end,
      subscription.cancel_at ?? Infinity,
    );
    const canceling =
      subscription.cancel_at_period_end ||
      (subscription.cancel_at !== null &&
        subscription.cancel_at !== undefined &&
        subscription.cancel_at <= items[0].current_period_end);
    const paidUntil =
      subscription.status === "active" && invoice?.status === "paid"
        ? new Date(periodEnd * 1000)
        : null;
    const trialEnd = subscription.trial_end
      ? new Date(
          Math.min(subscription.trial_end, subscription.cancel_at ?? Infinity) *
            1000,
        )
      : null;
    const allowanceTrial = subscription.status === "trialing";
    const allowanceStart = allowanceTrial
      ? subscription.trial_start
      : items[0].current_period_start;
    const allowancePeriod = allowanceStart
      ? `${subscription.id}:${allowanceTrial ? "trial" : "paid"}:${allowanceStart}`
      : null;
    const allowanceResetsAt = allowanceTrial
      ? trialEnd
      : new Date(periodEnd * 1000);
    await db.query(
      `UPDATE workspaces SET stripe_subscription_id=$2,subscription_status=$3,
      trial_used=trial_used OR $4,trial_end=$5,paid_until=$6,cancel_at_period_end=$7,billing_plan=$8,
      allowance_period=$9,allowance_resets_at=$10,allowance_trial=$11,billing_updated_at=now()
      WHERE id=$1`,
      [
        workspace.id,
        subscription.id,
        subscription.status,
        !!subscription.trial_start,
        trialEnd,
        paidUntil,
        canceling,
        plan,
        allowancePeriod,
        allowanceResetsAt,
        allowanceTrial,
      ],
    );
    return hasAccess({
      subscription_status: subscription.status,
      trial_end: trialEnd,
      paid_until: paidUntil,
    })
      ? (workspace.id as string)
      : null;
  });
}

export async function refreshBilling(workspaceId: string) {
  if (!hosted() || isDemo()) throw new HttpError(404, "Billing is disabled.");
  const [workspace] = await query(
    "SELECT stripe_customer_id FROM workspaces WHERE id=$1",
    [workspaceId],
  );
  if (workspace?.stripe_customer_id) {
    const activeWorkspace = await reconcileCustomer(
      workspace.stripe_customer_id,
    );
    if (activeWorkspace) {
      const accounts = await query(
        "SELECT id FROM accounts WHERE workspace_id=$1 AND connected=true AND mode<>'paused'",
        [workspaceId],
      );
      for (const account of accounts) await enqueueAccount(account.id);
    }
  }
}

const acceptedEvents = new Set([
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "customer.subscription.paused",
  "customer.subscription.resumed",
  "customer.subscription.trial_will_end",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.payment_action_required",
]);
export async function processStripeEvent(event: Stripe.Event) {
  if (event.livemode !== (process.env.STRIPE_MODE === "live"))
    throw new Error("Stripe event environment mismatch");
  if (!acceptedEvents.has(event.type)) return;
  if (
    (await query("SELECT id FROM stripe_events WHERE id=$1", [event.id])).length
  )
    return;
  const object = event.data.object as {
    customer?: string | { id: string } | null;
  };
  const customer =
    typeof object.customer === "string" ? object.customer : object.customer?.id;
  if (customer) {
    const workspaceId = await reconcileCustomer(customer);
    if (workspaceId) {
      const accounts = await query(
        "SELECT id FROM accounts WHERE workspace_id=$1 AND connected=true AND mode<>'paused'",
        [workspaceId],
      );
      for (const account of accounts)
        await enqueueAccount(account.id, `${event.id}:${account.id}`);
    }
  }
  // Persist after publishing, so a failed publication is retried by Stripe.
  await query(
    "INSERT INTO stripe_events(id,type) VALUES($1,$2) ON CONFLICT DO NOTHING",
    [event.id, event.type],
  );
}
