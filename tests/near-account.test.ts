import { describe, it, expect, beforeEach, vi } from "vitest";
import { randomBytes } from "crypto";

// Set a deterministic encryption key for tests
const TEST_KEY = randomBytes(32).toString("hex");

beforeEach(() => {
  vi.stubEnv("NEAR_PRIVATE_KEY_ENCRYPTION_KEY", TEST_KEY);
});

import {
  encryptPrivateKey,
  decryptPrivateKey,
  generateNearAccountId,
} from "@/lib/near/account";

describe("NEAR private key encryption", () => {
  it("should round-trip encrypt and decrypt a private key", () => {
    const original = "ed25519:5Kx8bFn3...fakeprivatekey";
    const encrypted = encryptPrivateKey(original);
    const decrypted = decryptPrivateKey(encrypted);
    expect(decrypted).toBe(original);
  });

  it("should produce different ciphertext each call (random IV)", () => {
    const original = "ed25519:samekeysamekeysamekey";
    const enc1 = encryptPrivateKey(original);
    const enc2 = encryptPrivateKey(original);
    expect(enc1).not.toBe(enc2);

    // Both should decrypt to the same value
    expect(decryptPrivateKey(enc1)).toBe(original);
    expect(decryptPrivateKey(enc2)).toBe(original);
  });

  it("should fail to decrypt tampered data", () => {
    const original = "ed25519:mytestprivatekey";
    const encrypted = encryptPrivateKey(original);

    // Tamper with the base64 payload
    const buf = Buffer.from(encrypted, "base64");
    buf[buf.length - 1] ^= 0xff; // flip last byte
    const tampered = buf.toString("base64");

    expect(() => decryptPrivateKey(tampered)).toThrow();
  });
});

describe("generateNearAccountId", () => {
  it("should return correct format a-{prefix}.{parent}", () => {
    vi.stubEnv("NEAR_PARENT_ACCOUNT_ID", "myparent.testnet");
    const result = generateNearAccountId("abcdefghijklmnop");
    expect(result).toBe("a-abcdefgh.myparent.testnet");
  });

  it("should use first 8 chars of agentId, lowercased", () => {
    vi.stubEnv("NEAR_PARENT_ACCOUNT_ID", "parent.testnet");
    const result = generateNearAccountId("ABCDEFGHijklmnop");
    expect(result).toBe("a-abcdefgh.parent.testnet");
  });

  it("should throw when NEAR_PARENT_ACCOUNT_ID is unset", () => {
    vi.stubEnv("NEAR_PARENT_ACCOUNT_ID", "");
    expect(() => generateNearAccountId("test1234")).toThrow(
      "NEAR_PARENT_ACCOUNT_ID is not set",
    );
  });
});
