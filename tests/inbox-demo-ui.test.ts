import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { InboxDemo } from "../src/components/inbox-demo";

it("renders the unfiltered fictional inbox on the server, labeled as a demo", () => {
  const html = renderToStaticMarkup(createElement(InboxDemo));
  expect(html).toContain(">Demo<");
  expect(html.match(/class="demo-row/g)).toHaveLength(5);
  expect(html).not.toContain('data-gone="true"');
  expect(html).toContain("Sotto/Cold");
  expect(html).toContain(">Replay<");
  expect(html).not.toMatch(/@(gmail|sotto)\.com/);
});
