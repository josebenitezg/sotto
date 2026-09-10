import { expect, it } from "vitest";
import { processingErrorCode } from "../src/lib/server/processing-error";

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
