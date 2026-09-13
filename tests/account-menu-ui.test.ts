import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("next/navigation", () => ({ usePathname: () => "/review" }));
import { Workspace, ReviewPage } from "../src/components/workspace";
import { PublicHeader } from "../src/components/public-shell";
import { demoDashboard } from "../src/lib/demo";

const viewer = {
  email: "owner@studio.example",
  name: "Owner",
  picture: "https://lh3.googleusercontent.com/a/owner",
};

function shell(extra: Record<string, unknown>) {
  const data = structuredClone(demoDashboard);
  Object.assign(data, {
    demo: false,
    configured: true,
    authenticated: true,
    ...extra,
  });
  return renderToStaticMarkup(
    createElement(Workspace, {
      initial: data,
      children: createElement(ReviewPage),
    }),
  );
}

it("shows the signed-in person's picture as the account control", () => {
  const html = shell({ viewer });
  expect(html).toContain('aria-label="Account: owner@studio.example"');
  expect(html).toContain('src="https://lh3.googleusercontent.com/a/owner"');
  expect(html).toMatch(/referrerpolicy="no-referrer"/i);
  expect(html).not.toContain(">Sign out<");
});

it("falls back to an initial when there is no picture", () => {
  const html = shell({ viewer: { ...viewer, name: null, picture: null } });
  expect(html).toContain('aria-label="Account: owner@studio.example"');
  expect(html).not.toContain("<img");
  expect(html).toMatch(/aria-hidden="true"[^>]*>o</);
});

it("never borrows another address when the identity has none", () => {
  const html = shell({ viewer: { email: null, name: null, picture: null } });
  expect(html).toContain('aria-label="Account"');
  expect(html).not.toContain("owner@");
  expect(html).not.toContain('alex@studio.example"</span>');
});

it("keeps a plain Sign out when the session has no viewer", () => {
  const html = shell({ viewer: null });
  expect(html).toContain(">Sign out<");
  expect(html).not.toContain("Account:");
});

it("shows the account control on public pages for a signed-in person", () => {
  const html = renderToStaticMarkup(
    createElement(PublicHeader, { inApp: true, viewer }),
  );
  expect(html).toContain("Open Sotto");
  expect(html).toContain('aria-label="Account: owner@studio.example"');
  expect(html).not.toContain(">Pricing<");
  const anonymous = renderToStaticMarkup(createElement(PublicHeader, {}));
  expect(anonymous).toContain(">Sign in<");
  expect(anonymous).toContain(">Pricing<");
  expect(anonymous).not.toContain("Account:");
});
