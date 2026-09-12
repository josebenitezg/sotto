import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InboxDemo } from "../src/components/inbox-demo";

it("renders the unfiltered fictional inbox on the server, labeled as a demo", () => {
  const html = renderToStaticMarkup(createElement(InboxDemo));
  expect(html).toContain(">Demo<");
  // Five inbox rows plus two hidden copies waiting under Sotto/Cold.
  expect(html.match(/class="demo-row/g)).toHaveLength(7);
  expect(html).not.toContain('data-out="true"');
  expect(html).not.toContain('data-in="true"');
  expect(html).toContain("Sotto/Cold");
  expect(html).toContain(">Replay<");
  expect(html).toContain('role="status"');
  expect(html).not.toContain("aria-live");
  expect(html).not.toMatch(/@(gmail|sotto)\.com/);
  expect(html).not.toMatch(/\d\d:\d\d/);
});
