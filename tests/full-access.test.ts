import { readFile, readdir } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import {
  beforeAll,
  beforeEach,
  afterAll,
  afterEach,
  it,
  expect,
  vi,
} from "vitest";

const h = vi.hoisted(() => ({ db: null as unknown as PGlite }));
vi.mock("../src/lib/server/db", () => ({
  query: async (sql: string, params: unknown[] = []) =>
    (await h.db.query(sql, params)).rows,
  transaction: async (fn: (client: any) => Promise<unknown>) =>
    h.db.transaction((tx) =>
      fn({
        query: (sql: string, params: unknown[] = []) => tx.query(sql, params),
      }),
    ),
}));
vi.mock("../src/lib/server/queue", () => ({ enqueueAccount: vi.fn() }));
import { processingAllowed } from "../src/lib/server/entitlements";
import {
  workspaceAllowance,
  reserveMessage,
} from "../src/lib/server/allowances";
import { checkout } from "../src/lib/server/billing";
import { connectIdentity } from "../src/lib/server/workspaces";
import { pilotAdmission } from "../src/lib/server/global-config";

beforeAll(async () => {
  h.db = new PGlite();
  for (const file of (await readdir("db"))
    .filter((f) => f.endsWith(".sql"))
    .sort())
    await h.db.exec(await readFile(`db/${file}`, "utf8"));
});
afterAll(async () => h.db.close());
beforeEach(async () => {
  for (const [name, value] of Object.entries({
    BILLING_ENABLED: "true",
    CHECKOUT_ENABLED: "true",
    DEMO_MODE: "false",
    GMAIL_PROVIDER: "google",
    DATABASE_URL: "postgres://synthetic",
    APP_URL: "https://sotto.example",
    ENCRYPTION_KEY: "11".repeat(32),
    ALLOWED_GOOGLE_EMAILS: "pilot@example.com",
    GOOGLE_CLIENT_ID: "synthetic",
    GOOGLE_CLIENT_SECRET: "synthetic",
    STRIPE_SECRET_KEY: "sk_test_synthetic",
    STRIPE_PRICE_SOLO_ID: "price_solo",
    STRIPE_PRICE_DUO_ID: "price_duo",
    STRIPE_WEBHOOK_SECRET: "whsec_synthetic",
    STRIPE_PORTAL_CONFIGURATION_ID: "bpc_synthetic",
    ENABLE_MAILBOX_WRITES: "false",
  }))
    vi.stubEnv(name, value);
  await h.db.exec(`TRUNCATE workspaces CASCADE;
    UPDATE global_config SET value='[]' WHERE key='full_access_emails';
    INSERT INTO workspaces(id,email) VALUES('owner','owner@example.com'),('other','other@example.com');
    INSERT INTO accounts(id,email,name,token_cipher,workspace_id) VALUES('primary','owner@example.com','Work','synthetic','owner');`);
});
afterEach(() => vi.unstubAllEnvs());
const grant = (value: unknown) =>
  h.db.query(
    "UPDATE global_config SET value=$1 WHERE key='full_access_emails'",
    [JSON.stringify(value)],
  );

it("grants full processing and all mailbox slots without creating a trial, checkout or permanent internal status", async () => {
  expect(await processingAllowed("owner")).toBe(false);
  await grant(["owner@example.com"]);
  expect(await processingAllowed("owner")).toBe(true);
  expect(await processingAllowed("other")).toBe(false);
  expect(await workspaceAllowance("owner")).toBeNull();
  await reserveMessage("primary", "mail-1");
  await expect(checkout("owner", "solo")).rejects.toMatchObject({
    status: 409,
  });
  for (const sub of ["second", "third"])
    await connectIdentity(
      { sub, email: `${sub}@example.com` },
      "synthetic-refresh",
      "owner",
    );
  const {
    rows: [owner],
  } = await h.db.query(
    "SELECT internal,trial_used,stripe_customer_id,subscription_status FROM workspaces WHERE id='owner'",
  );
  expect(owner).toEqual({
    internal: false,
    trial_used: false,
    stripe_customer_id: null,
    subscription_status: "none",
  });
  expect((await h.db.query("SELECT * FROM usage_periods")).rows).toHaveLength(
    0,
  );
  await grant([]);
  expect(await processingAllowed("owner")).toBe(false);
});

it("restores the same paid allowance immediately after revocation without resetting usage or the trial", async () => {
  await h.db
    .exec(`UPDATE workspaces SET subscription_status='active',paid_until=now()+interval '20 days',
    trial_used=true,allowance_period='paid:original',allowance_resets_at=now()+interval '20 days',allowance_trial=false WHERE id='owner';
    INSERT INTO usage_periods(workspace_id,period,used) VALUES('owner','paid:original',250);`);
  await grant(["owner@example.com"]);
  await reserveMessage("primary", "free-check");
  expect(await workspaceAllowance("owner")).toBeNull();
  await grant([]);
  expect(await processingAllowed("owner")).toBe(true);
  expect(await workspaceAllowance("owner")).toMatchObject({
    used: 250,
    limit: 250,
    exhausted: true,
  });
  await expect(reserveMessage("primary", "next-check")).rejects.toThrow(
    "included emails",
  );
  const {
    rows: [owner],
  } = await h.db.query(
    "SELECT allowance_period,trial_used FROM workspaces WHERE id='owner'",
  );
  expect(owner).toEqual({
    allowance_period: "paid:original",
    trial_used: true,
  });
});

it("uses the verified owner email, not the email of a mailbox linked to another workspace", async () => {
  await grant(["guest@example.com"]);
  await h.db.query(
    "INSERT INTO accounts(id,email,name,token_cipher,workspace_id) VALUES('guest','guest@example.com','Guest','synthetic','owner')",
  );
  expect(await processingAllowed("owner")).toBe(false);
  await expect(reserveMessage("guest", "private-mail")).rejects.toThrow(
    "not active",
  );
  expect(await pilotAdmission("Owner@example.com", null)).toBe(false);
  expect(await pilotAdmission("guest@example.com", null)).toBe(true);
});

it("admits configured full-access owners during the private pilot and permits their browser-bound additional connections", async () => {
  await grant(["owner@example.com"]);
  expect(await pilotAdmission("OWNER@example.com", null)).toBe(true);
  expect(await pilotAdmission("secondary@example.com", "owner")).toBe(true);
  expect(await pilotAdmission("secondary@example.com", "other")).toBe(false);
  expect(await pilotAdmission("pilot@example.com", null)).toBe(true);
  expect(await pilotAdmission("stranger@example.com", null)).toBe(false);
});

it.each([
  { value: ["*"] },
  { value: ["@example.com"] },
  { value: { "owner@example.com": true } },
  { value: true },
  { value: null },
])(
  "fails closed for wildcard or malformed full-access values (%j)",
  async ({ value }) => {
    await grant(value);
    expect(await processingAllowed("owner")).toBe(false);
    expect(await pilotAdmission("owner@example.com", null)).toBe(false);
  },
);
