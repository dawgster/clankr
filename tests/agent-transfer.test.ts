import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent } from "./helpers/seed";

// Mock inngest
vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

// Mock transferNear at module boundary
vi.mock("@/lib/near/transfer", () => ({
  transferNear: vi.fn().mockResolvedValue({
    transactionHash: "mock-tx-hash-abc123",
    senderAccountId: "a-sender.testnet",
    receiverAccountId: "a-receiver.testnet",
    amountYocto: "500000000000000000000000",
  }),
}));

import { POST as agentTransfer } from "@/app/api/v1/agent/transfer/route";
import { transferNear } from "@/lib/near/transfer";

async function setNearFields(
  agentId: string,
  accountId: string,
  encryptedKey = "mock-encrypted-key",
) {
  await db.externalAgent.update({
    where: { id: agentId },
    data: {
      nearAccountId: accountId,
      nearPublicKey: "ed25519:mock-public-key",
      nearEncryptedPrivateKey: encryptedKey,
    },
  });
}

async function connectUsers(userAId: string, userBId: string) {
  await db.connection.create({
    data: { userAId, userBId },
  });
}

describe("POST /api/v1/agent/transfer", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("transfers NEAR between connected agents with NEAR accounts", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const bob = await createTestUser({ displayName: "Bob" });
    const { agent: aliceAgent, apiKey: aliceKey } = await createTestAgent(
      alice.id,
      "Alice Agent",
    );
    const { agent: bobAgent } = await createTestAgent(bob.id, "Bob Agent");

    await setNearFields(aliceAgent.id, "a-alice.testnet");
    await setNearFields(bobAgent.id, "a-bob.testnet");
    await connectUsers(alice.id, bob.id);

    const res = await agentTransfer(
      new NextRequest("http://localhost/api/v1/agent/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({
          recipientUserId: bob.id,
          amount: "0.5",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.transactionHash).toBe("mock-tx-hash-abc123");
    expect(data.senderAccountId).toBe("a-sender.testnet");
    expect(data.receiverAccountId).toBe("a-receiver.testnet");
    expect(data.amountYocto).toBe("500000000000000000000000");

    expect(transferNear).toHaveBeenCalledWith({
      senderAccountId: "a-alice.testnet",
      senderEncryptedPrivateKey: "mock-encrypted-key",
      receiverAccountId: "a-bob.testnet",
      amount: "0.5",
    });
  });

  it("rejects unauthenticated requests", async () => {
    const res = await agentTransfer(
      new NextRequest("http://localhost/api/v1/agent/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recipientUserId: "some-id",
          amount: "1",
        }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("rejects self-transfer", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const { apiKey: aliceKey } = await createTestAgent(
      alice.id,
      "Alice Agent",
    );

    const res = await agentTransfer(
      new NextRequest("http://localhost/api/v1/agent/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({
          recipientUserId: alice.id,
          amount: "1",
        }),
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Cannot transfer to yourself");
  });

  it("rejects transfer to unconnected user", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const bob = await createTestUser({ displayName: "Bob" });
    const { agent: aliceAgent, apiKey: aliceKey } = await createTestAgent(
      alice.id,
      "Alice Agent",
    );
    await createTestAgent(bob.id, "Bob Agent");

    await setNearFields(aliceAgent.id, "a-alice.testnet");

    const res = await agentTransfer(
      new NextRequest("http://localhost/api/v1/agent/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({
          recipientUserId: bob.id,
          amount: "1",
        }),
      }),
    );

    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toBe("Not connected with this user");
  });

  it("rejects when sender has no NEAR account", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const bob = await createTestUser({ displayName: "Bob" });
    const { apiKey: aliceKey } = await createTestAgent(
      alice.id,
      "Alice Agent",
    );
    const { agent: bobAgent } = await createTestAgent(bob.id, "Bob Agent");

    await setNearFields(bobAgent.id, "a-bob.testnet");
    await connectUsers(alice.id, bob.id);

    const res = await agentTransfer(
      new NextRequest("http://localhost/api/v1/agent/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({
          recipientUserId: bob.id,
          amount: "1",
        }),
      }),
    );

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe("Sender agent has no NEAR account");
  });

  it("rejects when recipient has no NEAR account", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const bob = await createTestUser({ displayName: "Bob" });
    const { agent: aliceAgent, apiKey: aliceKey } = await createTestAgent(
      alice.id,
      "Alice Agent",
    );
    await createTestAgent(bob.id, "Bob Agent");

    await setNearFields(aliceAgent.id, "a-alice.testnet");
    await connectUsers(alice.id, bob.id);

    const res = await agentTransfer(
      new NextRequest("http://localhost/api/v1/agent/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({
          recipientUserId: bob.id,
          amount: "1",
        }),
      }),
    );

    expect(res.status).toBe(422);
    const data = await res.json();
    expect(data.error).toBe("Recipient agent has no NEAR account");
  });

  it("rejects invalid request body", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const { apiKey: aliceKey } = await createTestAgent(
      alice.id,
      "Alice Agent",
    );

    const res = await agentTransfer(
      new NextRequest("http://localhost/api/v1/agent/transfer", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({ amount: "1" }), // missing recipientUserId
      }),
    );

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("Invalid request body");
  });
});
