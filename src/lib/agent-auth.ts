import { randomBytes, createHash } from "crypto";
import { NextRequest } from "next/server";
import { db } from "./db";

const API_KEY_PREFIX = "clankr_";
const CLAIM_TOKEN_PREFIX = "clankr_claim_";
const KEY_BYTE_LENGTH = 32; // 64 hex chars

export function generateApiKey() {
  const raw = randomBytes(KEY_BYTE_LENGTH).toString("hex");
  const key = `${API_KEY_PREFIX}${raw}`;
  return {
    key,
    hash: hashApiKey(key),
    prefix: `${API_KEY_PREFIX}${raw.slice(0, 4)}`,
  };
}

export function generateClaimToken() {
  return `${CLAIM_TOKEN_PREFIX}${randomBytes(KEY_BYTE_LENGTH).toString("hex")}`;
}

export function hashApiKey(key: string) {
  return createHash("sha256").update(key).digest("hex");
}

export function validateApiKeyFormat(key: string): boolean {
  if (!key.startsWith(API_KEY_PREFIX)) return false;
  const raw = key.slice(API_KEY_PREFIX.length);
  return raw.length === KEY_BYTE_LENGTH * 2 && /^[0-9a-f]+$/.test(raw);
}

export async function authenticateAgent(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new AuthError("Missing or invalid Authorization header", 401);
  }

  const key = authHeader.slice(7);
  if (!validateApiKeyFormat(key)) {
    throw new AuthError("Invalid API key format", 401);
  }

  const hash = hashApiKey(key);
  const agent = await db.externalAgent.findUnique({
    where: { apiKeyHash: hash },
  });

  if (!agent) {
    throw new AuthError("Invalid API key", 401);
  }

  if (agent.status === "SUSPENDED") {
    throw new AuthError("Agent is suspended", 403);
  }

  // Update lastSeenAt
  await db.externalAgent.update({
    where: { id: agent.id },
    data: { lastSeenAt: new Date() },
  });

  return agent;
}

export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "AuthError";
    this.status = status;
  }
}
