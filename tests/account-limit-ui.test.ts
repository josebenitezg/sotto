import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/accounts" }));
import { Workspace, AccountsPage } from "../src/components/workspace";
import { demoDashboard } from "../src/lib/demo";

function render(accountLimit: number | null, connected: number) {
  const data = structuredClone(demoDashboard);
  data.demo = false;
  data.configured = true;
  data.authenticated = true;
  data.accountLimit = accountLimit;
  data.accounts = data.accounts.map((account, index) => ({
    ...account,
    connected: index < connected,
  }));
  return renderToStaticMarkup(
    createElement(Workspace, {
      initial: data,
      children: createElement(AccountsPage),
    }),
  );
}

it("hides the add-account button once the plan's mailbox limit is reached", () => {
  const html = render(1, 1);
  expect(html).not.toContain("Add account");
  expect(html).toContain("Your plan covers 1 Gmail account");
  expect(html).toMatch(/href="\/pricing"[^>]*>Change plan</);
});

it("offers to add an account while the plan has room", () => {
  expect(render(2, 1)).toContain("Add account");
});

it("offers to add an account when the limit is unknown or unlimited", () => {
  expect(render(null, 2)).toContain("Add account");
});

it("does not link to a Plan tab in the workspace navigation", () => {
  const html = render(1, 1);
  expect(html).not.toMatch(/<a[^>]*href="\/pricing"[^>]*>Plan</);
});
