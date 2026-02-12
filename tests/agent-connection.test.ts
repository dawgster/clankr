import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent } from "./helpers/seed";

// Mock inngest
vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { inngest } from "@/inngest/client";
import { POST as agentConnect } from "@/app/api/v1/agent/connect/route";

describe("Agent Connection Flow", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("should send a connection request to another user", async () => {
    const sender = await createTestUser({ displayName: "Sender" });
    const receiver = await createTestUser({ displayName: "Receiver" });
    const { apiKey } = await createTestAgent(sender.id);

    const req = new NextRequest("http://localhost/api/v1/agent/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        toUserId: receiver.id,
        category: "COLLABORATION",
        intent: "Would love to work together on a project",
      }),
    });

    const res = await agentConnect(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.requestId).toBeDefined();

    // Verify the connection request in the DB
    const connReq = await db.connectionRequest.findUnique({
      where: { id: body.requestId },
    });
    expect(connReq).not.toBeNull();
    expect(connReq!.fromUserId).toBe(sender.id);
    expect(connReq!.toUserId).toBe(receiver.id);
    expect(connReq!.category).toBe("COLLABORATION");
    expect(connReq!.status).toBe("PENDING");

    // Verify inngest event was sent
    expect(inngest.send).toHaveBeenCalledWith({
      name: "connection/request.created",
      data: { requestId: body.requestId },
    });
  });

  it("should prevent self-connection", async () => {
    const user = await createTestUser({ displayName: "Solo User" });
    const { apiKey } = await createTestAgent(user.id);

    const req = new NextRequest("http://localhost/api/v1/agent/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        toUserId: user.id,
        intent: "Connect to myself",
      }),
    });

    const res = await agentConnect(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("yourself");
  });

  it("should prevent duplicate connection requests", async () => {
    const sender = await createTestUser({ displayName: "Dup Sender" });
    const receiver = await createTestUser({ displayName: "Dup Receiver" });
    const { apiKey } = await createTestAgent(sender.id);

    const payload = {
      toUserId: receiver.id,
      intent: "First request",
    };

    // First request should succeed
    const req1 = new NextRequest("http://localhost/api/v1/agent/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const res1 = await agentConnect(req1);
    expect(res1.status).toBe(200);

    // Second request should be rejected
    const req2 = new NextRequest("http://localhost/api/v1/agent/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ...payload, intent: "Second request" }),
    });
    const res2 = await agentConnect(req2);
    expect(res2.status).toBe(409);
  });

  it("should prevent connection to already-connected user", async () => {
    const sender = await createTestUser({ displayName: "Already A" });
    const receiver = await createTestUser({ displayName: "Already B" });
    const { apiKey } = await createTestAgent(sender.id);

    // Create existing connection
    await db.connection.create({
      data: { userAId: sender.id, userBId: receiver.id },
    });

    const req = new NextRequest("http://localhost/api/v1/agent/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        toUserId: receiver.id,
        intent: "Already connected",
      }),
    });

    const res = await agentConnect(req);
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toContain("Already connected");
  });

  it("should return 404 for non-existent target user", async () => {
    const sender = await createTestUser({ displayName: "Missing Target" });
    const { apiKey } = await createTestAgent(sender.id);

    const req = new NextRequest("http://localhost/api/v1/agent/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        toUserId: "nonexistent_user_id",
        intent: "Hello?",
      }),
    });

    const res = await agentConnect(req);
    expect(res.status).toBe(404);
  });

  it("should require an unclaimed agent to be forbidden", async () => {
    // Create an unclaimed agent (no userId)
    const { key, hash, prefix } = await import("@/lib/agent-auth").then(
      (m) => m.generateApiKey(),
    );
    await db.externalAgent.create({
      data: {
        name: "Unclaimed Agent",
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        status: "UNCLAIMED",
      },
    });

    const req = new NextRequest("http://localhost/api/v1/agent/connect", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        toUserId: "some-user-id",
        intent: "Test unclaimed",
      }),
    });

    const res = await agentConnect(req);
    expect(res.status).toBe(403);
  });
});
