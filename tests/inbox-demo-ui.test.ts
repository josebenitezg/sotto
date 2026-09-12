import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InboxDemo } from "../src/components/inbox-demo";

it("renders the whole fictional inbox on the server, with nothing gone yet", () => {
  const html = renderToStaticMarkup(createElement(InboxDemo));
  expect(html.match(/class="demo-row/g)).toHaveLength(5);
  expect(html).not.toContain('data-gone="true"');
  expect(html).toContain("Sotto/Cold");
  expect(html).toContain('aria-label="Replay"');
  expect(html).toContain('role="status"');
  expect(html).not.toContain("aria-live");
  expect(html).not.toMatch(/@(gmail|sotto)\.com/);
  // Cold rows are split into letters that each carry their own path.
  expect((html.match(/class="demo-char"/g) ?? []).length).toBeGreaterThan(80);
  expect(html).toContain("--dx:");
});

it("renders the same letter offsets on every pass", () => {
  const a = renderToStaticMarkup(createElement(InboxDemo));
  const b = renderToStaticMarkup(createElement(InboxDemo));
  expect(a).toBe(b);
});
