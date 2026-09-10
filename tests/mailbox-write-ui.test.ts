import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/cuentas" }));
import { Workspace, AccountsPage } from "../src/components/workspace";
import { demoDashboard } from "../src/lib/demo";

it("enables account controls only for the permitted account, even when the dashboard aggregate is true", () => {
  const data = structuredClone(demoDashboard);
  data.demo = false;
  data.configured = true;
  data.authenticated = true;
  data.writesEnabled = true;
  data.accounts = data.accounts.map((account, index) => ({
    ...account,
    mode: "review",
    writesEnabled: index === 1,
  }));
  data.decisions = data.accounts.map((account, index) => ({
    ...data.decisions[0],
    id: `decision-${index}`,
    accountId: account.id,
  }));
  const html = renderToStaticMarkup(
    createElement(Workspace, {
      initial: data,
      children: createElement(AccountsPage),
    }),
  );
  const activateButtons = [
    ...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g),
  ].filter(([, , content]) => content.includes("Activar filtro"));
  expect(activateButtons).toHaveLength(2);
  expect(activateButtons[0][1]).toMatch(/\bdisabled=""/);
  expect(activateButtons[1][1]).not.toMatch(/\bdisabled=/);
  expect(html).toContain(
    "El movimiento de correos está desactivado para esta cuenta.",
  );
});
