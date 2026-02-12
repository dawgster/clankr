import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import {
  createTestUser,
  createTestAgent,
  createTestAgentEvent,
} from "./helpers/seed";

// Mock inngest so event dispatching doesn't actually run
vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { GET as getEvents } from "@/app/api/v1/agent/events/route";

describe("Agent Event Polling", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("should return pending events for an authenticated agent", async () => {
    const user = await createTestUser({ displayName: "Event User" });
    const { agent, apiKey } = await createTestAgent(user.id);

    // Create a connection request and event
    const otherUser = await createTestUser({ displayName: "Requester" });
    const connReq = await db.connectionRequest.create({
      data: {
        fromUserId: otherUser.id,
        toUserId: user.id,
        category: "NETWORKING",
        intent: "Want to collaborate on testing",
      },
    });

    await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      connectionRequestId: connReq.id,
      payload: {
        requestId: connReq.id,
        fromUser: { username: "requester", displayName: "Requester" },
        category: "NETWORKING",
        intent: "Want to collaborate on testing",
      },
    });

    const req = new NextRequest("http://localhost/api/v1/agent/events", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const res = await getEvents(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.events).toHaveLength(1);
    expect(body.events[0].type).toBe("CONNECTION_REQUEST");
    expect(body.events[0].status).toBe("PENDING");
  });

  it("should mark PENDING events as DELIVERED after polling", async () => {
    const user = await createTestUser({ displayName: "Delivery User" });
    const { agent, apiKey } = await createTestAgent(user.id);

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    const req = new NextRequest("http://localhost/api/v1/agent/events", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    await getEvents(req);

    // Verify the event was marked as DELIVERED
    const updated = await db.agentEvent.findUnique({
      where: { id: event.id },
    });
    expect(updated!.status).toBe("DELIVERED");
  });

  it("should not return expired events", async () => {
    const user = await createTestUser({ displayName: "Expiry User" });
    const { agent, apiKey } = await createTestAgent(user.id);

    // Create an already-expired event
    await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
      expiresInMs: -1000, // expired 1 second ago
    });

    const req = new NextRequest("http://localhost/api/v1/agent/events", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    const res = await getEvents(req);
    const body = await res.json();
    expect(body.events).toHaveLength(0);
  });

  it("should return 401 for missing authorization", async () => {
    const req = new NextRequest("http://localhost/api/v1/agent/events");

    const res = await getEvents(req);
    expect(res.status).toBe(401);
  });

  it("should return 401 for invalid API key", async () => {
    const req = new NextRequest("http://localhost/api/v1/agent/events", {
      headers: { Authorization: "Bearer clankr_invalidkeyinvalidkeyinvalidkeyinvalidkeyinvalidkeyinvalidkeyx" },
    });

    const res = await getEvents(req);
    expect(res.status).toBe(401);
  });

  it("should update agent lastSeenAt on authentication", async () => {
    const user = await createTestUser({ displayName: "Seen User" });
    const { agent, apiKey } = await createTestAgent(user.id);

    const beforeTime = new Date();

    const req = new NextRequest("http://localhost/api/v1/agent/events", {
      headers: { Authorization: `Bearer ${apiKey}` },
    });

    await getEvents(req);

    const updated = await db.externalAgent.findUnique({
      where: { id: agent.id },
    });
    expect(updated!.lastSeenAt).not.toBeNull();
    expect(updated!.lastSeenAt!.getTime()).toBeGreaterThanOrEqual(
      beforeTime.getTime(),
    );
  });
});
