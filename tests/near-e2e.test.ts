import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomBytes } from "crypto";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  nearToYocto,
  teraToGas,
} from "near-api-js";
import type { KeyPairString } from "near-api-js";

const TEST_ENCRYPTION_KEY = randomBytes(32).toString("hex");
const FAUCET_CONTRACT_ID = "v2.faucet.nonofficial.testnet";
const FAUCET_AMOUNT = nearToYocto("10");

async function fundFromFaucet(
  callerAccount: Account,
  receiverId: string,
): Promise<void> {
  await callerAccount.callFunction({
    contractId: FAUCET_CONTRACT_ID,
    methodName: "request_near",
    args: {
      receiver_id: receiverId,
      request_amount: FAUCET_AMOUNT.toString(),
    },
    gas: teraToGas("30"),
    deposit: 0n,
  });
}

describe("NEAR testnet E2E", () => {
  let parentAccountId: string;
  let parentKeyPair: KeyPair;
  let parentAccount: Account;
  let provider: JsonRpcProvider;

  beforeAll(async () => {
    vi.stubEnv("NEAR_PRIVATE_KEY_ENCRYPTION_KEY", TEST_ENCRYPTION_KEY);

    parentKeyPair = KeyPair.fromRandom("ED25519");
    const publicKey = parentKeyPair.getPublicKey().toString();

    // Create a temporary funded testnet account via helper service
    const randomSuffix = randomBytes(8).toString("hex");
    parentAccountId = `clankr-test-${randomSuffix}.testnet`;

    const res = await fetch("https://helper.testnet.near.org/account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        newAccountId: parentAccountId,
        newAccountPublicKey: publicKey,
      }),
    });

    if (!res.ok) {
      throw new Error(
        `Failed to create testnet account: ${res.status} ${await res.text()}`,
      );
    }

    provider = new JsonRpcProvider({ url: "https://rpc.testnet.near.org" });
    parentAccount = new Account(
      parentAccountId,
      provider,
      parentKeyPair.toString() as KeyPairString,
    );

    // Fund from faucet to ensure sufficient balance for sub-account creation
    await fundFromFaucet(parentAccount, parentAccountId);

    const state = await parentAccount.getState();
    console.log(
      `Created and funded parent account ${parentAccountId} with balance ${state.balance.available}`,
    );
  }, 60_000);

  afterAll(async () => {
    if (parentAccount) {
      try {
        await parentAccount.deleteAccount("testnet");
        console.log(`Deleted parent account ${parentAccountId}`);
      } catch (err) {
        console.warn(`Failed to delete parent account: ${err}`);
      }
    }
  }, 30_000);

  it("should create a sub-account on testnet", async () => {
    const subKeyPair = KeyPair.fromRandom("ED25519");
    const subPrefix = "sub1test";
    const subAccountId = `${subPrefix}.${parentAccountId}`;

    await parentAccount.createSubAccount({
      accountOrPrefix: subPrefix,
      publicKey: subKeyPair.getPublicKey(),
      nearToTransfer: nearToYocto("0.1"),
    });

    const accountView = await provider.viewAccount({
      accountId: subAccountId,
    });
    expect(accountView).toBeDefined();
    expect(BigInt(accountView.amount)).toBeGreaterThan(0n);
  }, 30_000);

  it("should have correct access key on sub-account", async () => {
    const subKeyPair = KeyPair.fromRandom("ED25519");
    const subPrefix = "sub2keys";
    const subAccountId = `${subPrefix}.${parentAccountId}`;

    await parentAccount.createSubAccount({
      accountOrPrefix: subPrefix,
      publicKey: subKeyPair.getPublicKey(),
      nearToTransfer: nearToYocto("0.1"),
    });

    const keys = await provider.viewAccessKeyList({
      accountId: subAccountId,
    });
    const pubKeyStr = subKeyPair.getPublicKey().toString();
    const matchingKey = keys.keys.find(
      (k: { public_key: string }) => k.public_key === pubKeyStr,
    );
    expect(matchingKey).toBeDefined();
    expect(matchingKey!.access_key.permission).toBe("FullAccess");
  }, 30_000);

  it("should create sub-account via createNearSubAccount()", async () => {
    vi.stubEnv("NEAR_PARENT_ACCOUNT_ID", parentAccountId);
    vi.stubEnv("NEAR_PARENT_PRIVATE_KEY", parentKeyPair.toString());
    vi.stubEnv("NEAR_NETWORK_ID", "testnet");

    const { createNearSubAccount, decryptPrivateKey } = await import(
      "@/lib/near/account"
    );

    const agentId = "testcuid1xyzabc";
    const result = await createNearSubAccount(agentId);

    // Verify returned accountId format
    const expectedPrefix = agentId.slice(0, 8).toLowerCase();
    expect(result.accountId).toBe(
      `a-${expectedPrefix}.${parentAccountId}`,
    );

    // Verify account exists on-chain
    const accountView = await provider.viewAccount({
      accountId: result.accountId,
    });
    expect(accountView).toBeDefined();
    expect(BigInt(accountView.amount)).toBeGreaterThan(0n);

    // Verify encrypted private key round-trips
    const decryptedKey = decryptPrivateKey(result.encryptedPrivateKey);
    expect(decryptedKey).toMatch(/^ed25519:/);

    // Verify the public key matches
    const recoveredKeyPair = KeyPair.fromString(
      decryptedKey as KeyPairString,
    );
    expect(recoveredKeyPair.getPublicKey().toString()).toBe(
      result.publicKey,
    );
  }, 30_000);

  it("should fail when creating duplicate sub-account", async () => {
    vi.stubEnv("NEAR_PARENT_ACCOUNT_ID", parentAccountId);
    vi.stubEnv("NEAR_PARENT_PRIVATE_KEY", parentKeyPair.toString());
    vi.stubEnv("NEAR_NETWORK_ID", "testnet");

    const { createNearSubAccount } = await import("@/lib/near/account");

    const agentId = "dupetest1xyzabc";
    await createNearSubAccount(agentId);

    // Second call with same agentId should fail (account already exists)
    await expect(createNearSubAccount(agentId)).rejects.toThrow();
  }, 60_000);
});
