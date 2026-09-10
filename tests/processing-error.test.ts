import { expect, it } from "vitest";
import {
  ClassifierRateLimit,
  processingErrorCode,
  retryAfterSeconds,
  retryPlan,
} from "../src/lib/server/processing-error";

it("reports actionable provider failures without disclosing error contents", () => {
  expect(processingErrorCode(new Error("Classifier HTTP 429"))).toBe(
    "classifier_http_429",
  );
  expect(
    processingErrorCode(new DOMException("private body", "TimeoutError")),
  ).toBe("provider_timeout");
  expect(processingErrorCode(new Error("Incomplete classification"))).toBe(
    "classifier_incomplete",
  );
  expect(processingErrorCode(new SyntaxError("private body"))).toBe(
    "classifier_invalid_output",
  );
  for (const error of [
    new Error("secret token, subject and body"),
    "private string",
    { status: 500, body: "private" },
  ])
    expect(processingErrorCode(error)).toBe("processing_failed");
});
it("respects Retry-After seconds and dates, including malformed headers", () => {
  const now = Date.parse("2026-09-10T12:00:00Z");
  expect(retryAfterSeconds("120", now)).toBe(120);
  expect(retryAfterSeconds("Thu, 10 Sep 2026 12:10:00 GMT", now)).toBe(600);
  expect(retryAfterSeconds("0", now)).toBe(60);
  for (const value of [null, "", "nonsense", "-10", "Infinity"])
    expect(retryAfterSeconds(value, now)).toBe(300);
});
it("keeps rate-limited mail pending while bounding ordinary failures", () => {
  expect(retryPlan(new ClassifierRateLimit(600), 9)).toEqual({
    state: "pending",
    delay: 600,
    deferMailbox: true,
  });
  expect(retryPlan(new Error("Malformed output"), 8)).toEqual({
    state: "failed",
    delay: 3600,
    deferMailbox: false,
  });
});
