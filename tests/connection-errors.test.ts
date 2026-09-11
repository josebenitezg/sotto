import { expect, it } from "vitest";
import {
  connectionErrorCode,
  connectionErrorMessage,
} from "../src/lib/connection-errors";

it("keeps legacy or untrusted error parameters generic without reflecting their content", () => {
  for (const value of [
    "1",
    "__proto__",
    "constructor",
    "private@example.com",
    "<script>secret</script>",
    undefined,
    ["not_allowed"],
  ]) {
    expect(connectionErrorCode(value)).toBe("failed");
    expect(connectionErrorMessage(value)).toBe(
      "We couldn't finish connecting this account. Please try again.",
    );
  }
});
it("gives a useful next step for a pilot or plan restriction without blaming Gmail consent", () => {
  expect(connectionErrorMessage("not_allowed")).toContain("private pilot");
  expect(connectionErrorMessage("account_limit")).toContain(
    "two Gmail accounts",
  );
  expect(connectionErrorMessage("not_allowed")).not.toContain(
    "allow access to Gmail",
  );
});
