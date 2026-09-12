import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  session: "workspace-a" as string | null,
  workspace: {} as Record<string, unknown>,
}));
vi.mock("../src/lib/server/auth", () => ({
  sessionWorkspace: async () => h.session,
}));
vi.mock("../src/lib/server/db", () => ({
  query: async () => [h.workspace],
}));
vi.mock("../src/lib/server/billing", () => ({
  billingReady: () => true,
  trialRequiresCard: () => true,
}));
vi.mock("../src/lib/server/allowances", () => ({
  workspaceAllowance: async () => null,
}));
vi.mock("../src/lib/server/config", () => ({
  configured: () => true,
  hosted: () => true,
  isDemo: () => false,
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

import PlansPage from "../src/app/(public)/pricing/page";

beforeEach(() => {
  h.session = "workspace-a";
  h.workspace = {
    stripe_customer_id: "cus_synthetic",
    stripe_subscription_id: "sub_synthetic",
    billing_plan: "solo",
    subscription_status: "trialing",
    trial_end: new Date("2099-01-01T00:00:00Z"),
    trial_used: true,
    connected_accounts: 1,
  };
});

async function render(checkout?: string) {
  return renderToStaticMarkup(
    await PlansPage({ searchParams: Promise.resolve({ checkout }) }),
  );
}

it("returns only the welcome and accounts action after a confirmed checkout", async () => {
  const html = await render("success");
  expect(html).toContain("Thank you");
  expect(html).toContain("Your Solo trial is ready.");
  expect(html).toMatch(/href="\/accounts"[^>]*>Manage my accounts</);
  expect(html).not.toContain('id="plan-solo"');
  expect(html).not.toContain("Back to Sotto");
  expect(html).not.toContain("/month");
  expect(html).not.toContain("/ month");
});

it("does not treat the success URL or complimentary access as payment confirmation", async () => {
  h.workspace = {
    ...h.workspace,
    full_access: true,
    stripe_subscription_id: null,
    subscription_status: "none",
  };
  const html = await render("success");
  expect(html).toContain("Confirming your subscription");
  expect(html).not.toContain("trial is ready");
  expect(html).not.toContain("plan is active");
  expect(html).not.toContain('id="plan-solo"');
});

it("requires a session for the checkout return", async () => {
  h.session = null;
  await expect(render("success")).rejects.toThrow("redirect:/login");
});

it("marks exactly the subscribed plan, including a trial over its mailbox limit", async () => {
  h.workspace.connected_accounts = 2;
  const html = await render();
  const solo = html.match(
    /<section[^>]*aria-labelledby="plan-solo"[\s\S]*?<\/section>/,
  )?.[0];
  expect(solo).toContain("Current plan");
  expect(html.match(/Current plan/g)).toHaveLength(1);
  expect(html).toContain("Disconnect an extra account");
});

it("updates the selected card when the subscriber switches to Duo", async () => {
  h.workspace = {
    ...h.workspace,
    billing_plan: "duo",
    subscription_status: "active",
    paid_until: new Date("2099-01-01T00:00:00Z"),
  };
  const html = await render();
  const duo = html.match(
    /<section[^>]*aria-labelledby="plan-duo"[\s\S]*?<\/section>/,
  )?.[0];
  expect(duo).toContain("Current plan");
  expect(html.match(/Current plan/g)).toHaveLength(1);
  expect(await render("success")).toContain("Your Duo plan is active.");
});

it("does not mark an expired trial or complimentary default as an active plan", async () => {
  h.workspace.trial_end = new Date("2020-01-01T00:00:00Z");
  expect(await render()).not.toContain("Current plan");
  h.workspace = {
    ...h.workspace,
    stripe_subscription_id: null,
    full_access: true,
  };
  expect(await render()).not.toContain("Current plan");
});
