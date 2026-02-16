import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent } from "./helpers/seed";
import { HOMESERVER_URL } from "@/lib/matrix/api";
import { GET as agentMe } from "@/app/api/v1/agent/me/route";

describe("GET /api/v1/agent/me", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.restoreAllMocks();
  });

  it("returns 403 for unclaimed agent", async () => {
    const { key, hash, prefix } = await import("@/lib/agent-auth").then((m) =>
      m.generateApiKey(),
    );

    await db.externalAgent.create({
      data: {
        name: "Unclaimed",
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        status: "ACTIVE",
      },
    });

    const res = await agentMe(
      new NextRequest("http://localhost/api/v1/agent/me", {
        headers: { Authorization: `Bearer ${key}` },
      }),
    );

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe(
      "Agent must be claimed to access user profile",
    );
  });

  it("returns user profile with matrix and near metadata when configured", async () => {
    const user = await createTestUser({ displayName: "Owner" });
    const { agent, apiKey } = await createTestAgent(user.id, "Owner Agent");

    await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        matrixUserId: "@agent-owner:localhost",
        matrixAccessToken: "matrix-agent-token",
        matrixDeviceId: "AGENT_DEVICE",
        nearAccountId: "a-owner.testnet",
        nearPublicKey: "ed25519:near-owner-key",
      },
    });

    const res = await agentMe(
      new NextRequest("http://localhost/api/v1/agent/me", {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();

    expect(body.user.id).toBe(user.id);
    expect(body.user.profile.displayName).toBe("Owner");
    expect(body.matrix).toEqual({
      homeserverUrl: HOMESERVER_URL,
      userId: "@agent-owner:localhost",
      accessToken: "matrix-agent-token",
      deviceId: "AGENT_DEVICE",
      ownerMatrixId: user.matrixUserId,
    });
    expect(body.near).toEqual({
      accountId: "a-owner.testnet",
      publicKey: "ed25519:near-owner-key",
    });
  });

  it("returns null matrix and near blocks when agent has no integrations", async () => {
    const user = await createTestUser({ displayName: "Plain Owner" });
    const { apiKey } = await createTestAgent(user.id, "Plain Agent");

    const res = await agentMe(
      new NextRequest("http://localhost/api/v1/agent/me", {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.matrix).toBeNull();
    expect(body.near).toBeNull();
  });
});
