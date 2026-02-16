import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent } from "./helpers/seed";

// Mock inngest
vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

// Mock getNearBalance at module boundary
vi.mock("@/lib/near/balance", () => ({
  getNearBalance: vi.fn().mockResolvedValue({
    accountId: "a-mock.testnet",
    balanceYocto: "95000000000000000000000",
    balanceNear: "0.095",
  }),
}));

import { GET as agentBalance } from "@/app/api/v1/agent/balance/route";
import { getNearBalance } from "@/lib/near/balance";

describe("GET /api/v1/agent/balance", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("returns balance for agent with NEAR account", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const { agent, apiKey } = await createTestAgent(alice.id, "Alice Agent");

    await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        nearAccountId: "a-alice.testnet",
        nearPublicKey: "ed25519:mock-key",
        nearEncryptedPrivateKey: "mock-encrypted",
      },
    });

    const res = await agentBalance(
      new NextRequest("http://localhost/api/v1/agent/balance", {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.accountId).toBe("a-mock.testnet");
    expect(data.balanceYocto).toBe("95000000000000000000000");
    expect(data.balanceNear).toBe("0.095");

    expect(getNearBalance).toHaveBeenCalledWith("a-alice.testnet");
  });

  it("rejects unauthenticated requests", async () => {
    const res = await agentBalance(
      new NextRequest("http://localhost/api/v1/agent/balance"),
    );

    expect(res.status).toBe(401);
  });

  it("rejects unclaimed agent", async () => {
    const { key, hash, prefix } = await import("@/lib/agent-auth").then(
      (m) => m.generateApiKey(),
    );

    await db.externalAgent.create({
      data: {
        name: "Unclaimed Agent",
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        userId: null,
        status: "ACTIVE",
      },
    });

    const res = await agentBalance(
      new NextRequest("http://localhost/api/v1/agent/balance", {
        headers: { Authorization: `Bearer ${key}` },
      }),
    );

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Agent must be claimed to check balance");
  });

  it("rejects agent with no NEAR account", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const { apiKey } = await createTestAgent(alice.id, "Alice Agent");

    const res = await agentBalance(
      new NextRequest("http://localhost/api/v1/agent/balance", {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    );

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe("Agent has no NEAR account");
  });
});
