import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  describe,
  it,
  expect,
  vi,
} from "vitest";
import type Stripe from "stripe";
const h = vi.hoisted(() => ({
  db: null as unknown as PGlite,
  failSave: false,
  subscriptions: [] as any[],
  checkouts: new Map<string, any>(),
  customers: new Map<string, any>(),
  create: vi.fn(),
  retrieve: vi.fn(),
  expire: vi.fn(),
  customer: vi.fn(),
  price: vi.fn(),
  portal: vi.fn(),
  list: vi.fn(),
  enqueue: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, params: unknown[] = []) =>
    (await h.db.query(sql, params)).rows,
  transaction: async (fn: (db: any) => Promise<unknown>) =>
    h.db.transaction((tx) =>
      fn({
        query: async (sql: string, params: unknown[] = []) => {
          if (
            h.failSave &&
            sql.startsWith("UPDATE workspaces SET checkout_id=$2")
          ) {
            h.failSave = false;
            throw new Error("Lost database connection");
          }
          return tx.query(sql, params);
        },
      }),
    ),
}));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: h.enqueue }));
vi.mock("stripe", async (importOriginal) => {
  const { default: RealStripe } =
    await importOriginal<typeof import("stripe")>();
  return {
    default: class {
      prices = { retrieve: h.price };
      customers = { create: h.customer };
      subscriptions = { list: h.list };
      checkout = {
        sessions: { create: h.create, retrieve: h.retrieve, expire: h.expire },
      };
      billingPortal = { sessions: { create: h.portal } };
      webhooks = new RealStripe("sk_test_synthetic").webhooks;
    },
  };
});
import {
  checkout,
  billingReady,
  portal,
  processStripeEvent,
  reconcileCustomer,
} from "../src/lib/server/billing";
import {
  hasAccess,
  accountProcessingAllowed,
} from "../src/lib/server/entitlements";
import { POST as webhook } from "../src/app/api/stripe/webhook/route";
import { stripe } from "../src/lib/server/billing";

beforeAll(async () => {
  h.db = new PGlite();
  for (const name of [
    "001_initial.sql",
    "002_billing.sql",
    "007_plans.sql",
    "008_mail_allowances.sql",
  ])
    await h.db.exec(
      await readFile(new URL(`../db/${name}`, import.meta.url), "utf8"),
    );
});
afterAll(async () => h.db.close());
beforeEach(async () => {
  vi.resetAllMocks();
  h.subscriptions = [];
  h.checkouts.clear();
  h.customers.clear();
  h.failSave = false;
  for (const [key, value] of Object.entries({
    BILLING_ENABLED: "true",
    DEMO_MODE: "false",
    CHECKOUT_ENABLED: "true",
    APP_URL: "https://sotto.example",
    DATABASE_URL: "postgres://synthetic",
    ENCRYPTION_KEY: "11".repeat(32),
    ALLOWED_GOOGLE_EMAILS: "owner@example.com",
    GOOGLE_CLIENT_ID: "synthetic",
    GOOGLE_CLIENT_SECRET: "synthetic",
    STRIPE_SECRET_KEY: "sk_test_synthetic",
    STRIPE_PRICE_SOLO_ID: "price_solo",
    STRIPE_PRICE_DUO_ID: "price_sotto",
    STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_sotto",
    STRIPE_MODE: "test",
    TRIAL_REQUIRE_CARD: "false",
  }))
    vi.stubEnv(key, value);
  await h.db.exec("TRUNCATE workspaces, stripe_events CASCADE");
  await h.db.query(
    "INSERT INTO workspaces(id,email) VALUES('a','owner@example.com'),('b','second@example.com')",
  );
  await h.db.query(
    "INSERT INTO accounts(id,email,name,token_cipher,workspace_id) VALUES('gmail-a','owner@example.com','Trabajo','synthetic','a'),('gmail-b','second@example.com','Personal','synthetic','b')",
  );
  h.price.mockResolvedValue({
    id: "price_sotto",
    active: true,
    currency: "usd",
    unit_amount: 900,
    recurring: { interval: "month", interval_count: 1 },
  });
  h.customer.mockImplementation(async (_params, opts) => {
    if (!h.customers.has(opts.idempotencyKey))
      h.customers.set(opts.idempotencyKey, { id: "cus_a" });
    return h.customers.get(opts.idempotencyKey);
  });
  h.create.mockImplementation(async (params, opts) => {
    if (!h.checkouts.has(opts.idempotencyKey))
      h.checkouts.set(opts.idempotencyKey, {
        id: "cs_a",
        url: "https://checkout.stripe.com/c/pay/synthetic",
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        params,
      });
    return h.checkouts.get(opts.idempotencyKey);
  });
  h.retrieve.mockResolvedValue({
    id: "cs_a",
    status: "open",
    url: "https://checkout.stripe.com/c/pay/synthetic",
  });
  h.list.mockImplementation(async () => ({
    data: h.subscriptions,
    has_more: false,
  }));
  h.portal.mockResolvedValue({
    url: "https://billing.stripe.com/p/session/synthetic",
  });
  h.enqueue.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());
function subscription(
  status = "trialing",
  trialEnd = Date.now() / 1000 + 86400,
) {
  return {
    id: "sub_a",
    customer: "cus_a",
    created: 100,
    metadata: { application: "sotto", sotto_workspace_id: "a" },
    status,
    trial_start: 100,
    trial_end: trialEnd,
    cancel_at_period_end: false,
    latest_invoice: { status: "paid" },
    items: {
      data: [
        {
          price: { id: "price_sotto" },
          quantity: 1,
          current_period_start: Math.floor(Date.now() / 1000),
          current_period_end: Date.now() / 1000 + 86400,
        },
      ],
    },
  };
}
function event(id = "evt_a", live = false) {
  return {
    id,
    type: "customer.subscription.updated",
    livemode: live,
    data: {
      object: {
        customer: "cus_a",
        status: "trialing",
        trial_end: Date.now() / 1000 + 864000,
      },
    },
  } as unknown as Stripe.Event;
}
describe("billing access and checkout recovery", () => {
  it("uses the selected Solo price with a card and a three-day trial", async () => {
    vi.stubEnv("TRIAL_REQUIRE_CARD", "true");
    h.price.mockResolvedValue({
      id: "price_solo",
      active: true,
      currency: "usd",
      unit_amount: 500,
      recurring: { interval: "month", interval_count: 1 },
    });
    await checkout("a", "solo");
    expect(h.price).toHaveBeenCalledWith("price_solo");
    const params = h.create.mock.calls[0][0];
    expect(params.line_items).toEqual([{ price: "price_solo", quantity: 1 }]);
    expect(params.payment_method_collection).toBe("always");
    expect(params.subscription_data.trial_period_days).toBe(3);
    expect(params.subscription_data.metadata.plan).toBe("solo");
  });
  it("rejects an arbitrary plan or a Solo checkout with two connected accounts", async () => {
    await expect(checkout("a", "untrusted" as any)).rejects.toMatchObject({
      status: 400,
    });
    await h.db.query(
      "INSERT INTO accounts(id,email,name,token_cipher,workspace_id) VALUES('extra','extra@example.com','Work','synthetic','a')",
    );
    await expect(checkout("a", "solo")).rejects.toMatchObject({ status: 409 });
    expect(h.create).not.toHaveBeenCalled();
  });
  it("expires an open checkout before switching plans, preserving retry safety", async () => {
    await checkout("a", "duo");
    h.price.mockResolvedValue({
      active: true,
      currency: "usd",
      unit_amount: 500,
      recurring: { interval: "month", interval_count: 1 },
    });
    expect(await checkout("a", "solo")).toBeNull();
    expect(h.expire).toHaveBeenCalledWith("cs_a");
    await checkout("a", "solo");
    expect(h.create.mock.calls[1][0].line_items[0].price).toBe("price_solo");
    expect(h.create.mock.calls[1][1].idempotencyKey).not.toBe(
      h.create.mock.calls[0][1].idempotencyKey,
    );
  });
  it("stops access at the exact trial deadline and fails closed for non-paying states", () => {
    const end = Date.now() + 3 * 86400000;
    const access = {
      subscription_status: "trialing",
      trial_end: new Date(end),
      paid_until: null,
    };
    expect(hasAccess(access, end - 1)).toBe(true);
    expect(hasAccess(access, end)).toBe(false);
    for (const status of [
      "canceled",
      "past_due",
      "unpaid",
      "paused",
      "incomplete",
      "none",
    ])
      expect(
        hasAccess({ ...access, subscription_status: status }, end - 1),
      ).toBe(false);
    expect(
      hasAccess({ ...access, subscription_status: "active", paid_until: null }),
    ).toBe(false);
    expect(hasAccess(undefined)).toBe(false);
  });
  it("creates a three-day no-card trial and reuses an open checkout", async () => {
    expect(await checkout("a")).toContain("checkout.stripe.com");
    const params = h.create.mock.calls[0][0];
    expect(params.customer).toBe("cus_a");
    expect(params.subscription_data.trial_period_days).toBe(3);
    expect(
      params.subscription_data.trial_settings.end_behavior
        .missing_payment_method,
    ).toBe("cancel");
    expect(params.payment_method_collection).toBe("if_required");
    await checkout("a");
    expect(h.checkouts.size).toBe(1);
    expect(h.customer).toHaveBeenCalledTimes(1);
    expect(h.create).toHaveBeenCalledTimes(1);
  });
  it("recovers a successful Stripe call followed by database failure without a duplicate", async () => {
    h.failSave = true;
    await expect(checkout("a")).rejects.toThrow("Lost database");
    await checkout("a");
    expect(h.customers.size).toBe(1);
    expect(h.checkouts.size).toBe(1);
    expect(h.create.mock.calls[0][1].idempotencyKey).toBe(
      h.create.mock.calls[1][1].idempotencyKey,
    );
  });
  it("recovers and expires a lost checkout before retrying a different plan", async () => {
    h.failSave = true;
    await expect(checkout("a", "duo")).rejects.toThrow("Lost database");
    h.price.mockResolvedValue({
      active: true,
      currency: "usd",
      unit_amount: 500,
      recurring: { interval: "month", interval_count: 1 },
    });
    expect(await checkout("a", "solo")).toBeNull();
    expect(h.create.mock.calls[1]).toEqual(h.create.mock.calls[0]);
    expect(h.expire).toHaveBeenCalledWith("cs_a");
    await checkout("a", "solo");
    expect(h.create.mock.calls[2][0].line_items[0].price).toBe("price_solo");
    expect(h.create.mock.calls[2][1].idempotencyKey).not.toBe(
      h.create.mock.calls[0][1].idempotencyKey,
    );
  });
  it("uses provider history to prevent a second trial even if the webhook was missed", async () => {
    h.subscriptions = [subscription("canceled", 1000)];
    await checkout("a");
    expect(
      h.create.mock.calls[0][0].subscription_data.trial_period_days,
    ).toBeUndefined();
    expect(h.create.mock.calls[0][0].payment_method_collection).toBe("always");
  });
  it("rejects price mismatch and disconnected mailboxes before creating a customer", async () => {
    h.price.mockResolvedValueOnce({
      active: true,
      currency: "usd",
      unit_amount: 9000,
      recurring: { interval: "month", interval_count: 1 },
    });
    await expect(checkout("a")).rejects.toThrow("published monthly plan");
    await h.db.query(
      "UPDATE accounts SET connected=false WHERE workspace_id='a'",
    );
    await expect(checkout("a")).rejects.toMatchObject({ status: 409 });
    expect(h.customer).not.toHaveBeenCalled();
  });
  it("sends existing subscriptions to the customer portal and never creates a second subscription", async () => {
    h.subscriptions = [subscription()];
    expect(await checkout("a")).toContain("billing.stripe.com");
    expect(h.create).not.toHaveBeenCalled();
  });
  it("binds the portal to the authenticated workspace customer", async () => {
    await h.db.query(
      "UPDATE workspaces SET stripe_customer_id='cus_b' WHERE id='b'",
    );
    await portal("b");
    expect(h.portal.mock.calls[0][0].customer).toBe("cus_b");
    await expect(portal("a")).rejects.toMatchObject({ status: 409 });
  });
});
describe("signed events and provider-authoritative access", () => {
  beforeEach(async () => {
    await h.db.query(
      "UPDATE workspaces SET stripe_customer_id='cus_a' WHERE id='a'",
    );
  });
  it("does not revive an expired subscription from a delayed active event", async () => {
    h.subscriptions = [subscription("canceled", 1000)];
    await processStripeEvent(event());
    expect(await accountProcessingAllowed("gmail-a")).toBe(false);
    expect(
      (
        await h.db.query(
          "SELECT subscription_status,trial_used FROM workspaces WHERE id='a'",
        )
      ).rows,
    ).toEqual([{ subscription_status: "canceled", trial_used: true }]);
    expect(h.enqueue).not.toHaveBeenCalled();
  });
  it("grants only the matching workspace, deduplicates events, retries failed publication", async () => {
    h.subscriptions = [subscription()];
    h.enqueue.mockRejectedValueOnce(new Error("Queue unavailable"));
    await expect(processStripeEvent(event())).rejects.toThrow(
      "Queue unavailable",
    );
    expect((await h.db.query("SELECT * FROM stripe_events")).rows).toHaveLength(
      0,
    );
    await processStripeEvent(event());
    const calls = h.list.mock.calls.length;
    await processStripeEvent(event());
    expect(h.list).toHaveBeenCalledTimes(calls);
    expect(h.enqueue.mock.calls.every(([id]) => id === "gmail-a")).toBe(true);
    expect(await accountProcessingAllowed("gmail-a")).toBe(true);
    expect(await accountProcessingAllowed("gmail-b")).toBe(false);
  });
  it("does not grant access for an unpaid invoice, wrong price or live event", async () => {
    h.subscriptions = [
      { ...subscription("active"), latest_invoice: { status: "open" } },
    ];
    expect(await reconcileCustomer("cus_a")).toBeNull();
    h.subscriptions = [
      {
        ...subscription(),
        items: { data: [{ price: { id: "price_other" }, quantity: 1 }] },
      },
    ];
    await expect(reconcileCustomer("cus_a")).rejects.toThrow(
      "Unexpected subscription product",
    );
    await expect(processStripeEvent(event("evt_live", true))).rejects.toThrow(
      "environment mismatch",
    );
  });
  it("stores the verified plan and pauses an over-capacity downgrade until an account is disconnected", async () => {
    const sub = subscription();
    sub.items.data[0].price.id = "price_solo";
    h.subscriptions = [sub];
    await reconcileCustomer("cus_a");
    expect(
      (
        await h.db.query(
          "SELECT billing_plan,trial_used FROM workspaces WHERE id='a'",
        )
      ).rows[0],
    ).toEqual({ billing_plan: "solo", trial_used: true });
    await h.db.query(
      "INSERT INTO accounts(id,email,name,token_cipher,workspace_id) VALUES('extra','extra@example.com','Work','synthetic','a')",
    );
    expect(await accountProcessingAllowed("gmail-a")).toBe(false);
    await h.db.query("UPDATE accounts SET connected=false WHERE id='extra'");
    expect(await accountProcessingAllowed("gmail-a")).toBe(true);
    sub.items.data[0].price.id = "price_sotto";
    await reconcileCustomer("cus_a");
    await h.db.query("UPDATE accounts SET connected=true WHERE id='extra'");
    expect(await accountProcessingAllowed("extra")).toBe(true);
  });
  it("keeps usage through plan changes and replay, but identifies a new paid period", async () => {
    const sub = subscription("active");
    h.subscriptions = [sub];
    await reconcileCustomer("cus_a");
    const get = async () =>
      (
        await h.db.query(
          "SELECT allowance_period,billing_plan FROM workspaces WHERE id='a'",
        )
      ).rows[0] as any;
    const first = await get();
    await h.db.query("INSERT INTO usage_periods VALUES('a',$1,200)", [
      first.allowance_period,
    ]);
    sub.items.data[0].price.id = "price_solo";
    await reconcileCustomer("cus_a");
    expect((await get()).allowance_period).toBe(first.allowance_period);
    expect(
      (
        await h.db.query(
          "SELECT used FROM usage_periods WHERE workspace_id='a'",
        )
      ).rows[0],
    ).toEqual({ used: 200 });
    sub.items.data[0].current_period_start += 30 * 86400;
    sub.items.data[0].current_period_end += 30 * 86400;
    await reconcileCustomer("cus_a");
    expect((await get()).allowance_period).not.toBe(first.allowance_period);
  });
  it("honors an explicit portal cancellation date even when cancel_at_period_end is false", async () => {
    const sub = {
      ...subscription("active"),
      cancel_at: Math.floor(Date.now() / 1000) + 600,
      cancel_at_period_end: false,
    };
    h.subscriptions = [sub];
    await reconcileCustomer("cus_a");
    const [w] = (
      await h.db.query<{
        cancel_at_period_end: boolean;
        paid_until: Date;
        allowance_resets_at: Date;
      }>(
        "SELECT cancel_at_period_end,paid_until,allowance_resets_at FROM workspaces WHERE id=$1",
        ["a"],
      )
    ).rows;
    expect(w.cancel_at_period_end).toBe(true);
    expect(w.paid_until.getTime()).toBe(sub.cancel_at * 1000);
    expect(w.allowance_resets_at.getTime()).toBe(sub.cancel_at * 1000);
    expect(
      hasAccess(
        {
          subscription_status: "active",
          trial_end: null,
          paid_until: w.paid_until,
        },
        sub.cancel_at * 1000,
      ),
    ).toBe(false);
    h.subscriptions = [{ ...sub, status: "trialing" }];
    await reconcileCustomer("cus_a");
    const [trial] = (
      await h.db.query<{ trial_end: Date }>(
        "SELECT trial_end FROM workspaces WHERE id=$1",
        ["a"],
      )
    ).rows;
    expect(trial.trial_end.getTime()).toBe(sub.cancel_at * 1000);
  });
  it("verifies the raw request signature before touching billing state", async () => {
    const payload = JSON.stringify(event("evt_signed"));
    const signature = stripe().webhooks.generateTestHeaderString({
      payload,
      secret: "whsec_synthetic",
    });
    const request = (body: string, sig?: string) =>
      new Request("https://sotto.example/api/stripe/webhook", {
        method: "POST",
        body,
        headers: sig ? { "stripe-signature": sig } : {},
      });
    expect((await webhook(request(payload))).status).toBe(400);
    expect((await webhook(request(payload + " ", signature))).status).toBe(400);
    expect(h.list).not.toHaveBeenCalled();
    h.subscriptions = [subscription()];
    expect((await webhook(request(payload, signature))).status).toBe(200);
  });
});

it("opens Composio checkout only for the selected, verified delivery mode", () => {
  vi.stubEnv("GMAIL_PROVIDER", "composio");
  for (const name of [
    "COMPOSIO_API_KEY",
    "COMPOSIO_AUTH_CONFIG_ID",
    "COMPOSIO_WEBHOOK_SECRET",
  ])
    vi.stubEnv(name, "synthetic");
  vi.stubEnv("COMPOSIO_NOTIFICATION_MODE", "trigger");
  vi.stubEnv("COMPOSIO_POLLING_READY", "true");
  vi.stubEnv("COMPOSIO_TRIGGERS_READY", undefined);
  expect(billingReady()).toBe(false);
  vi.stubEnv("COMPOSIO_TRIGGERS_READY", "true");
  expect(billingReady()).toBe(true);
  vi.stubEnv("CHECKOUT_ENABLED", "false");
  expect(billingReady()).toBe(false);
  vi.stubEnv("CHECKOUT_ENABLED", "true");
  vi.stubEnv("COMPOSIO_NOTIFICATION_MODE", "poll");
  vi.stubEnv("COMPOSIO_POLLING_READY", "false");
  expect(billingReady()).toBe(false);
  vi.stubEnv("COMPOSIO_POLLING_READY", "true");
  expect(billingReady()).toBe(true);
  vi.stubEnv("COMPOSIO_NOTIFICATION_MODE", "unknown");
  expect(billingReady()).toBe(false);
});
