import Stripe from "stripe";
import { randomUUID } from "node:crypto";
import { appUrl, configured, hosted, isDemo, required } from "./config";
import { HttpError } from "./auth";
import { query, transaction } from "./db";
import { hasAccess } from "./entitlements";
import { enqueueAccount } from "./queue";

export const TRIAL_DAYS = 3;
export const trialRequiresCard = () =>
  process.env.TRIAL_REQUIRE_CARD === "true";
export const billingReady = () =>
  hosted() &&
  !isDemo() &&
  configured() &&
  process.env.CHECKOUT_ENABLED === "true" &&
  [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRICE_ID",
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
): Stripe.Checkout.SessionCreateParams {
  return {
    mode: "subscription",
    customer,
    client_reference_id: workspaceId,
    line_items: [{ price: required("STRIPE_PRICE_ID"), quantity: 1 }],
    payment_method_collection:
      trialUsed || trialRequiresCard() ? "always" : "if_required",
    payment_method_types: ["card"],
    subscription_data: {
      metadata: { sotto_workspace_id: workspaceId, application: "sotto" },
      ...(trialUsed
        ? {}
        : {
            trial_period_days: TRIAL_DAYS,
            trial_settings: {
              end_behavior: { missing_payment_method: "cancel" as const },
            },
          }),
    },
    metadata: { sotto_workspace_id: workspaceId, application: "sotto" },
    success_url: `${appUrl()}/planes?checkout=success`,
    cancel_url: `${appUrl()}/planes?checkout=canceled`,
    locale: "es",
  };
}

function serviceAvailable() {
  if (!billingReady())
    throw new HttpError(
      503,
      "Estamos terminando de preparar Sotto. La prueba todavía no comienza.",
    );
}

export async function checkout(workspaceId: string) {
  serviceAvailable();
  // Persist the idempotency key before provider calls. A timeout or database
  // failure can then be retried without creating a second Checkout Session.
  await query(
    "UPDATE workspaces SET checkout_attempt=$2 WHERE id=$1 AND checkout_attempt IS NULL",
    [workspaceId, randomUUID()],
  );
  return transaction(async (db) => {
    const {
      rows: [workspace],
    } = await db.query("SELECT * FROM workspaces WHERE id=$1 FOR UPDATE", [
      workspaceId,
    ]);
    if (!workspace || workspace.internal)
      throw new HttpError(409, "Este espacio no necesita una suscripción.");
    const {
      rows: [account],
    } = await db.query(
      "SELECT id FROM accounts WHERE workspace_id=$1 AND connected=true LIMIT 1",
      [workspaceId],
    );
    if (!account)
      throw new HttpError(409, "Conectá Gmail antes de comenzar tu prueba.");
    const api = stripe();
    const price = await api.prices.retrieve(required("STRIPE_PRICE_ID"));
    if (
      !price.active ||
      price.currency !== "usd" ||
      price.unit_amount !== Number(process.env.PLAN_PRICE_CENTS || "900") ||
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
          return_url: `${appUrl()}/planes`,
        })
      ).url;
    // Provider history also prevents another trial if the completion webhook
    // was temporarily unavailable or an old browser retries an expired trial.
    const trialUsed = workspace.trial_used || ours.some((s) => !!s.trial_start);
    if (workspace.checkout_id) {
      const previous = await api.checkout.sessions.retrieve(
        workspace.checkout_id,
      );
      if (previous.status === "open" && previous.url) return previous.url;
      // Save the next key outside this transaction before a later retry.
      await db.query(
        "UPDATE workspaces SET checkout_id=NULL,checkout_url=NULL,checkout_expires=NULL,checkout_attempt=NULL WHERE id=$1",
        [workspaceId],
      );
      return null;
    }
    const session = await api.checkout.sessions.create(
      checkoutParameters(workspaceId, customer, trialUsed),
      {
        idempotencyKey: `sotto:checkout:${workspaceId}:${workspace.checkout_attempt}`,
      },
    );
    if (!session.url) throw new Error("Checkout URL missing");
    await db.query(
      "UPDATE workspaces SET checkout_id=$2,checkout_url=$3,checkout_expires=$4,trial_used=$5 WHERE id=$1",
      [
        workspaceId,
        session.id,
        session.url,
        new Date(session.expires_at * 1000),
        trialUsed,
      ],
    );
    return session.url;
  });
}

export async function portal(workspaceId: string) {
  if (!hosted() || isDemo())
    throw new HttpError(404, "No hay facturación en esta instalación.");
  const [workspace] = await query(
    "SELECT stripe_customer_id FROM workspaces WHERE id=$1",
    [workspaceId],
  );
  if (!workspace?.stripe_customer_id)
    throw new HttpError(409, "Todavía no tenés una suscripción.");
  return (
    await stripe().billingPortal.sessions.create({
      customer: workspace.stripe_customer_id,
      configuration: required("STRIPE_PORTAL_CONFIGURATION_ID"),
      return_url: `${appUrl()}/planes`,
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
    if (
      items.length !== 1 ||
      items[0].price.id !== required("STRIPE_PRICE_ID") ||
      items[0].quantity !== 1
    )
      throw new Error("Unexpected subscription product");
    const invoice =
      typeof subscription.latest_invoice === "object"
        ? subscription.latest_invoice
        : null;
    const paidUntil =
      subscription.status === "active" && invoice?.status === "paid"
        ? new Date(items[0].current_period_end * 1000)
        : null;
    const trialEnd = subscription.trial_end
      ? new Date(subscription.trial_end * 1000)
      : null;
    await db.query(
      `UPDATE workspaces SET stripe_subscription_id=$2,subscription_status=$3,
      trial_used=trial_used OR $4,trial_end=$5,paid_until=$6,cancel_at_period_end=$7,billing_updated_at=now()
      WHERE id=$1`,
      [
        workspace.id,
        subscription.id,
        subscription.status,
        !!subscription.trial_start,
        trialEnd,
        paidUntil,
        subscription.cancel_at_period_end,
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
  if (!hosted() || isDemo())
    throw new HttpError(404, "Facturación desactivada.");
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
