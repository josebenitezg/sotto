import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type Stripe from "stripe";

const h = vi.hoisted(() => ({ db: null as unknown as PGlite, cookie: "" }));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, values: unknown[] = []) =>
    (await h.db.query(sql, values)).rows,
  transaction: async (fn: any) =>
    h.db.transaction((tx) =>
      fn({
        query: (sql: string, values: unknown[] = []) => tx.query(sql, values),
      }),
    ),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () => (h.cookie ? { value: h.cookie } : undefined),
  }),
}));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: vi.fn() }));
import { stripe, reconcileCustomer } from "../src/lib/server/billing";
import { hash } from "../src/lib/server/crypto";
import {
  createPairing,
  approvePairing,
  exchangePairing,
} from "../src/lib/server/desktop-pairing";
import { POST as desktop } from "../src/app/api/desktop/service/route";
import { POST as checkout } from "../src/app/api/billing/checkout/route";
import { POST as portal } from "../src/app/api/billing/portal/route";
import { POST as webhook } from "../src/app/api/stripe/webhook/route";

// Real Stripe sandbox; a fresh synthetic SQL database and customer per run.
// Never reads Gmail, uses a live key, or reuses an existing customer's subscription.
describe.skipIf(process.env.STRIPE_DESKTOP_INTEGRATION !== "true")(
  "desktop with real Stripe sandbox",
  () => {
    const workspace = `desktop-test-${randomUUID()}`;
    let customer = "";
    let subscription = "";
    const sessions: string[] = [];

    beforeAll(async () => {
      if (!/^([sr]k)_test_/.test(process.env.STRIPE_SECRET_KEY ?? ""))
        throw new Error("A test-only Stripe key is required");
      for (const [key, value] of Object.entries({
        STRIPE_MODE: "test",
        BILLING_ENABLED: "true",
        CHECKOUT_ENABLED: "true",
        DESKTOP_ENABLED: "true",
        DEMO_MODE: "false",
        GMAIL_PROVIDER: "google",
        APP_URL: "https://sotto.example",
        DATABASE_URL: "postgres://synthetic",
        ENCRYPTION_KEY: "11".repeat(32),
        ALLOWED_GOOGLE_EMAILS: "sandbox@example.invalid",
        GOOGLE_CLIENT_ID: "synthetic",
        GOOGLE_CLIENT_SECRET: "synthetic",
        STRIPE_WEBHOOK_SECRET: "whsec_desktop_synthetic",
        TRIAL_REQUIRE_CARD: "true",
      }))
        vi.stubEnv(key, value);
      h.db = new PGlite();
      for (const file of (await readdir("db"))
        .filter((f) => f.endsWith(".sql"))
        .sort())
        await h.db.exec(await readFile(`db/${file}`, "utf8"));
      // Production deploys can retry this additive migration safely.
      await h.db.exec(await readFile("db/012_desktop.sql", "utf8"));
      const created = await stripe().customers.create({
        name: "Sotto desktop integration test",
        metadata: {
          application: "sotto",
          sotto_workspace_id: workspace,
          synthetic: "true",
        },
      });
      expect(created.livemode).toBe(false);
      customer = created.id;
      await h.db.query(
        "INSERT INTO workspaces(id,email,stripe_customer_id) VALUES($1,'sandbox@example.invalid',$2)",
        [workspace, customer],
      );
      await h.db.query(
        "INSERT INTO accounts(id,email,name,workspace_id,token_cipher,mode,mail_provider) VALUES('synthetic-mail','sandbox@example.invalid','Sandbox',$1,'no-credential','paused','composio')",
        [workspace],
      );
      const proof = "de".repeat(32);
      const pairing = await createPairing(hash(proof));
      await approvePairing(pairing.id, workspace, pairing.code);
      h.cookie = (await exchangePairing(pairing.id, proof)).token!;
    }, 30000);

    afterAll(async () => {
      // Only resources created by this run may be removed.
      for (const id of sessions) {
        const session = await stripe().checkout.sessions.retrieve(id);
        if (session.status === "open")
          await stripe().checkout.sessions.expire(id);
      }
      if (subscription) {
        const current = await stripe().subscriptions.retrieve(subscription);
        if (current.status !== "canceled")
          await stripe().subscriptions.cancel(subscription);
      }
      if (customer) await stripe().customers.del(customer);
      await h.db?.close();
      vi.unstubAllEnvs();
    }, 30000);

    function request(path: string, body: unknown) {
      return new Request(`https://sotto.example${path}`, {
        method: "POST",
        headers: {
          origin: "https://sotto.example",
          accept: "application/json",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      });
    }
    async function overview() {
      const response = await desktop(
        request("/api/desktop/service", { action: "overview" }),
      );
      expect(response.status).toBe(200);
      return response.json();
    }
    async function startCheckout(plan: string) {
      const response = await checkout(
        request("/api/billing/checkout", { plan }),
      );
      expect(response.status).toBe(200);
      return (await response.json()).url as string;
    }

    it("uses the paired session for both checkout plans and the customer portal", async () => {
      expect((await overview()).dashboard.accessActive).toBe(false);
      expect(await startCheckout("solo")).toMatch(
        /^https:\/\/checkout.stripe.com\//,
      );
      let rows = (
        await h.db.query<{ checkout_id: string }>(
          "SELECT checkout_id FROM workspaces WHERE id=$1",
          [workspace],
        )
      ).rows;
      const solo = await stripe().checkout.sessions.retrieve(
        rows[0].checkout_id,
        { expand: ["line_items"] },
      );
      sessions.push(solo.id);
      expect(solo.livemode).toBe(false);
      expect(solo.line_items?.data[0].price?.id).toBe(
        process.env.STRIPE_PRICE_SOLO_ID,
      );
      expect(await startCheckout("solo")).toBe(solo.url);
      expect(await startCheckout("duo")).toMatch(
        /^https:\/\/checkout.stripe.com\//,
      );
      expect((await stripe().checkout.sessions.retrieve(solo.id)).status).toBe(
        "expired",
      );
      rows = (
        await h.db.query<{ checkout_id: string }>(
          "SELECT checkout_id FROM workspaces WHERE id=$1",
          [workspace],
        )
      ).rows;
      const duo = await stripe().checkout.sessions.retrieve(
        rows[0].checkout_id,
        { expand: ["line_items"] },
      );
      sessions.push(duo.id);
      expect(duo.line_items?.data[0].price?.id).toBe(
        process.env.STRIPE_PRICE_DUO_ID,
      );
      await stripe().checkout.sessions.expire(duo.id);
      const portalResponse = await portal(request("/api/billing/portal", {}));
      expect(portalResponse.status).toBe(200);
      expect((await portalResponse.json()).url).toMatch(
        /^https:\/\/billing.stripe.com\//,
      );
    }, 30000);

    // Creating the paid fixture requires subscription write access, which the
    // deployed app's restricted Checkout key intentionally does not need.
    it.skipIf(process.env.STRIPE_DESKTOP_PAYMENT_FIXTURE !== "true")(
      "reconciles a sandbox payment and signed cancellation into desktop access",
      async () => {
        // API fixture payment uses Stripe's documented test PaymentMethod.
        // It does not claim to exercise the hosted Checkout UI.
        const method = await stripe().paymentMethods.attach("pm_card_visa", {
          customer,
        });
        const paid = await stripe().subscriptions.create({
          customer,
          default_payment_method: method.id,
          items: [{ price: process.env.STRIPE_PRICE_DUO_ID!, quantity: 1 }],
          metadata: {
            application: "sotto",
            sotto_workspace_id: workspace,
            plan: "duo",
          },
          expand: ["latest_invoice"],
        });
        subscription = paid.id;
        expect(paid.livemode).toBe(false);
        expect(paid.status).toBe("active");
        expect((paid.latest_invoice as Stripe.Invoice).status).toBe("paid");
        expect(await reconcileCustomer(customer)).toBe(workspace);
        const active = await overview();
        expect(active.billing.has_subscription).toBe(true);
        expect(active.dashboard.accessActive).toBe(true);
        expect(active.dashboard.allowance.limit).toBe(500);
        const portalResponse = await portal(request("/api/billing/portal", {}));
        expect(portalResponse.status).toBe(200);
        expect((await portalResponse.json()).url).toMatch(
          /^https:\/\/billing.stripe.com\//,
        );
        expect(await startCheckout("duo")).toMatch(
          /^https:\/\/billing.stripe.com\//,
        );
        expect(
          (await stripe().subscriptions.list({ customer, status: "all" })).data,
        ).toHaveLength(1);

        const canceled = await stripe().subscriptions.cancel(subscription);
        const payload = JSON.stringify({
          id: `evt_desktop_${randomUUID()}`,
          object: "event",
          type: "customer.subscription.deleted",
          livemode: false,
          data: { object: canceled },
        });
        const signature = stripe().webhooks.generateTestHeaderString({
          payload,
          secret: process.env.STRIPE_WEBHOOK_SECRET!,
        });
        const response = await webhook(
          new Request("https://sotto.example/api/stripe/webhook", {
            method: "POST",
            headers: { "stripe-signature": signature },
            body: payload,
          }),
        );
        expect(response.status).toBe(200);
        const stopped = await overview();
        expect(stopped.billing.has_subscription).toBe(false);
        expect(stopped.dashboard.accessActive).toBe(false);
        expect(stopped.dashboard.allowance.remaining).toBe(0);
        expect(
          (
            await desktop(
              request("/api/desktop/service", {
                action: "enable",
                accountId: "synthetic-mail",
                mode: "review",
              }),
            )
          ).status,
        ).toBe(402);
      },
      60000,
    );
  },
);
