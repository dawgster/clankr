import { randomBytes, createCipheriv, createDecipheriv } from "crypto";
import {
  Account,
  JsonRpcProvider,
  KeyPair,
  nearToYocto,
} from "near-api-js";
import type { KeyPairString } from "near-api-js";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const hex = process.env.NEAR_PRIVATE_KEY_ENCRYPTION_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("NEAR_PRIVATE_KEY_ENCRYPTION_KEY must be 64 hex chars");
  }
  return Buffer.from(hex, "hex");
}

export function encryptPrivateKey(privateKey: string): string {
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(privateKey, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  // Format: base64(iv + tag + ciphertext)
  return Buffer.concat([iv, tag, encrypted]).toString("base64");
}

export function decryptPrivateKey(data: string): string {
  const key = getEncryptionKey();
  const buf = Buffer.from(data, "base64");
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const ciphertext = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final("utf8");
}

export function generateNearAccountId(agentId: string): string {
  const parentAccount = process.env.NEAR_PARENT_ACCOUNT_ID;
  if (!parentAccount) {
    throw new Error("NEAR_PARENT_ACCOUNT_ID is not set");
  }
  const prefix = agentId.slice(0, 8).toLowerCase();
  return `a-${prefix}.${parentAccount}`;
}

export async function createNearSubAccount(agentId: string): Promise<{
  accountId: string;
  publicKey: string;
  encryptedPrivateKey: string;
}> {
  const networkId = process.env.NEAR_NETWORK_ID || "testnet";
  const parentAccountId = process.env.NEAR_PARENT_ACCOUNT_ID;
  const parentPrivateKey = process.env.NEAR_PARENT_PRIVATE_KEY;

  if (!parentAccountId || !parentPrivateKey) {
    throw new Error(
      "NEAR_PARENT_ACCOUNT_ID and NEAR_PARENT_PRIVATE_KEY are required",
    );
  }

  // Generate a fresh keypair for the sub-account
  const keyPair = KeyPair.fromRandom("ED25519");
  const accountId = generateNearAccountId(agentId);

  // Set up parent account connection
  const provider = new JsonRpcProvider({
    url: `https://rpc.${networkId}.near.org`,
  });
  const parentAccount = new Account(
    parentAccountId,
    provider,
    parentPrivateKey as KeyPairString,
  );

  // Create sub-account with 0.1 NEAR initial balance
  const prefix = agentId.slice(0, 8).toLowerCase();
  await parentAccount.createSubAccount({
    accountOrPrefix: `a-${prefix}`,
    publicKey: keyPair.getPublicKey(),
    nearToTransfer: nearToYocto("0.1"),
  });

  const encryptedKey = encryptPrivateKey(keyPair.toString());

  return {
    accountId,
    publicKey: keyPair.getPublicKey().toString(),
    encryptedPrivateKey: encryptedKey,
  };
}
