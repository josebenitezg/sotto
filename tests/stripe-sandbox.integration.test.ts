import { readFile, readdir, writeFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
const h = vi.hoisted(() => ({
  db: null as unknown as PGlite,
  state: {} as any,
}));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, p: unknown[] = []) =>
    (await h.db.query(sql, p)).rows,
  transaction: async (fn: any) =>
    h.db.transaction((tx) =>
      fn({ query: (sql: string, p: unknown[] = []) => tx.query(sql, p) }),
    ),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
}));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: vi.fn() }));
import {
  stripe,
  checkout,
  reconcileCustomer,
  processStripeEvent,
} from "../src/lib/server/billing";
import {
  workspaceAllowance,
  reserveMessage,
  MailAllowanceReached,
} from "../src/lib/server/allowances";
import type Stripe from "stripe";
// Opt-in only. Real Stripe calls, synthetic local SQL, no Gmail credentials.
// Requires the state produced by private/stripe-sandbox-prepare.ts.
describe.skipIf(process.env.STRIPE_INTEGRATION !== "true")(
  "real Stripe sandbox",
  () => {
    beforeAll(async () => {
      if (!/^([sr]k)_test_/.test(process.env.STRIPE_SECRET_KEY ?? ""))
        throw new Error("A test-only key is required");
      h.state = JSON.parse(
        await readFile("private/stripe-sandbox-run.json", "utf8"),
      );
      for (const [k, v] of Object.entries({
        STRIPE_MODE: "test",
        BILLING_ENABLED: "true",
        CHECKOUT_ENABLED: "true",
        GMAIL_PROVIDER: "google",
        DEMO_MODE: "false",
        APP_URL: "https://sotto.email",
        DATABASE_URL: "postgres://synthetic",
        ENCRYPTION_KEY: "11".repeat(32),
        ALLOWED_GOOGLE_EMAILS: "sandbox@example.com",
        GOOGLE_CLIENT_ID: "synthetic",
        GOOGLE_CLIENT_SECRET: "synthetic",
        STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
        STRIPE_PORTAL_CONFIGURATION_ID: h.state.portal,
        TRIAL_REQUIRE_CARD: "true",
      }))
        vi.stubEnv(k, String(v));
      h.db = new PGlite();
      for (const f of (await readdir("db"))
        .filter((f) => f.endsWith(".sql"))
        .sort())
        await h.db.exec(await readFile(`db/${f}`, "utf8"));
      await h.db.query(
        `INSERT INTO workspaces(id,email,stripe_customer_id) VALUES($1,'sandbox@example.com',$2)`,
        [h.state.workspaceId, h.state.customer],
      );
      await h.db.query(
        `INSERT INTO accounts(id,email,name,token_cipher,workspace_id,mode) VALUES('sandbox-mail','sandbox@example.com','Sandbox','no-credential',$1,'paused')`,
        [h.state.workspaceId],
      );
    }, 30000);
    afterAll(async () => {
      await h.db?.close();
      vi.unstubAllEnvs();
    });
    it.skipIf(
      process.env.STRIPE_EXPECT_STATUS &&
        process.env.STRIPE_EXPECT_STATUS !== "active",
    )(
      "reconciles the real paid subscription, keeps quota on replay and rejects extra mail",
      async () => {
        const api = stripe();
        const sub = await api.subscriptions.retrieve(h.state.subscription, {
          expand: ["latest_invoice"],
        });
        expect(sub.livemode).toBe(false);
        expect(sub.status).toBe("active");
        expect((sub.latest_invoice as Stripe.Invoice).status).toBe("paid");
        await reconcileCustomer(h.state.customer);
        expect(await workspaceAllowance(h.state.workspaceId)).toMatchObject({
          limit:
            sub.items.data[0].price.id === process.env.STRIPE_PRICE_SOLO_ID
              ? 250
              : 500,
          used: 0,
          trial: false,
        });
        const [w] = (
          await h.db.query("SELECT * FROM workspaces WHERE id=$1", [
            h.state.workspaceId,
          ])
        ).rows as any[];
        const limit = (await workspaceAllowance(h.state.workspaceId))!.limit;
        expect(w.cancel_at_period_end).toBe(
          sub.cancel_at_period_end ||
            !!(
              sub.cancel_at &&
              sub.cancel_at <= sub.items.data[0].current_period_end
            ),
        );
        await h.db.query("INSERT INTO usage_periods VALUES($1,$2,$3)", [
          w.id,
          w.allowance_period,
          limit,
        ]);
        await reconcileCustomer(h.state.customer);
        expect((await workspaceAllowance(w.id))?.used).toBe(limit);
        await expect(
          reserveMessage("sandbox-mail", "over-limit"),
        ).rejects.toBeInstanceOf(MailAllowanceReached);
        // A new period is derived from current provider state, never event order.
        await h.db.query(
          "UPDATE workspaces SET allowance_period='obsolete-period' WHERE id=$1",
          [w.id],
        );
        await processStripeEvent({
          id: `evt_local_${Date.now()}`,
          type: "customer.subscription.deleted",
          livemode: false,
          data: { object: { customer: h.state.customer, status: "canceled" } },
        } as unknown as Stripe.Event);
        expect(
          (
            await h.db.query(
              "SELECT subscription_status,allowance_period FROM workspaces WHERE id=$1",
              [w.id],
            )
          ).rows[0],
        ).toMatchObject({
          subscription_status: "active",
          allowance_period: w.allowance_period,
        });
      },
      30000,
    );
    it.skipIf(process.env.STRIPE_EXPECT_STATUS === "canceled")(
      "routes an existing subscriber into the dedicated portal instead of creating another subscription",
      async () => {
        const before = await stripe().subscriptions.list({
          customer: h.state.customer,
          status: "all",
          limit: 100,
        });
        const url = await checkout(h.state.workspaceId, "solo");
        expect(url).toMatch(/^https:\/\/billing.stripe.com\//);
        await writeFile("private/stripe-sandbox-portal-url.txt", url!, {
          mode: 0o600,
        });
        const after = await stripe().subscriptions.list({
          customer: h.state.customer,
          status: "all",
          limit: 100,
        });
        expect(after.data.map((s) => s.id)).toEqual(
          before.data.map((s) => s.id),
        );
        expect(after.data.filter((s) => s.status !== "canceled")).toHaveLength(
          1,
        );
      },
      30000,
    );
    it("matches the current provider status and denies processing after failed payment or cancellation", async () => {
      const sub = await stripe().subscriptions.retrieve(h.state.subscription);
      expect(sub.status).toBe(process.env.STRIPE_EXPECT_STATUS ?? "active");
      const allowed = await reconcileCustomer(h.state.customer);
      if (["past_due", "canceled", "unpaid"].includes(sub.status)) {
        expect(allowed).toBeNull();
        expect((await workspaceAllowance(h.state.workspaceId))?.remaining).toBe(
          0,
        );
        await expect(
          reserveMessage("sandbox-mail", "blocked"),
        ).rejects.toBeInstanceOf(MailAllowanceReached);
      } else expect(allowed).toBe(h.state.workspaceId);
    }, 30000);
  },
);
