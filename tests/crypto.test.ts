import { describe, expect, it, vi } from "vitest";
import { seal, unseal, opaque, hash } from "../src/lib/server/crypto";
describe("credential encryption", () => {
  it("binds ciphertext to one account and detects tampering", () => {
    vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
    const ciphertext = seal("test-refresh-token", "gmail:work");
    expect(unseal(ciphertext, "gmail:work")).toBe("test-refresh-token");
    expect(ciphertext).not.toContain("test-refresh-token");
    expect(() => unseal(ciphertext, "gmail:personal")).toThrow();
    const bytes = Buffer.from(ciphertext, "base64url");
    bytes[15] ^= 1;
    expect(() => unseal(bytes.toString("base64url"), "gmail:work")).toThrow();
    vi.unstubAllEnvs();
  });
  it("uses independent random credentials and stable hashes", () => {
    expect(opaque()).not.toEqual(opaque());
    expect(hash("value")).toHaveLength(64);
  });
});
