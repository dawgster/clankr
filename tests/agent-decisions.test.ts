import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import {
  createTestUser,
  createTestAgent,
  createTestAgentEvent,
} from "./helpers/seed";

// Mock inngest
vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { POST as decideEvent } from "@/app/api/v1/agent/events/[id]/decide/route";

function buildDecideRequest(eventId: string, apiKey: string, decision: object) {
  const req = new NextRequest(
    `http://localhost/api/v1/agent/events/${eventId}/decide`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(decision),
    },
  );
  return req;
}

describe("Agent Decisions", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  describe("Connection Request Decisions", () => {
    it("should accept a connection request and create connection + thread + notifications", async () => {
      const fromUser = await createTestUser({ displayName: "From User" });
      const toUser = await createTestUser({ displayName: "To User" });
      const { agent, apiKey } = await createTestAgent(toUser.id);

      const connReq = await db.connectionRequest.create({
        data: {
          fromUserId: fromUser.id,
          toUserId: toUser.id,
          category: "NETWORKING",
          intent: "Let's connect",
        },
      });

      const { event } = await createTestAgentEvent({
        agentId: agent.id,
        type: "CONNECTION_REQUEST",
        connectionRequestId: connReq.id,
        payload: {
          requestId: connReq.id,
          fromUser: { username: "fromuser", displayName: "From User" },
          category: "NETWORKING",
          intent: "Let's connect",
        },
      });

      const req = buildDecideRequest(event.id, apiKey, {
        decision: "ACCEPT",
        confidence: 0.95,
        reason: "Looks like a great connection!",
      });

      const res = await decideEvent(req, {
        params: Promise.resolve({ id: event.id }),
      });
      expect(res.status).toBe(200);

      // Verify event is marked DECIDED
      const updatedEvent = await db.agentEvent.findUnique({
        where: { id: event.id },
      });
      expect(updatedEvent!.status).toBe("DECIDED");

      // Verify connection request is ACCEPTED
      const updatedReq = await db.connectionRequest.findUnique({
        where: { id: connReq.id },
      });
      expect(updatedReq!.status).toBe("ACCEPTED");

      // Verify connection was created
      const connection = await db.connection.findFirst({
        where: {
          OR: [
            { userAId: fromUser.id, userBId: toUser.id },
            { userAId: toUser.id, userBId: fromUser.id },
          ],
        },
      });
      expect(connection).not.toBeNull();

      // Verify message thread was created with both participants
      const thread = await db.messageThread.findFirst({
        include: { participants: true },
      });
      expect(thread).not.toBeNull();
      expect(thread!.participants).toHaveLength(2);
      const participantUserIds = thread!.participants.map((p) => p.userId).sort();
      expect(participantUserIds).toEqual([fromUser.id, toUser.id].sort());

      // Verify notifications for both users
      const notifications = await db.notification.findMany({
        orderBy: { createdAt: "asc" },
      });
      expect(notifications.length).toBeGreaterThanOrEqual(2);
      const notifTypes = notifications.map((n) => n.type);
      expect(notifTypes).toContain("CONNECTION_ACCEPTED");
      expect(notifTypes).toContain("AGENT_DECISION");
    });

    it("should reject a connection request and notify users", async () => {
      const fromUser = await createTestUser({ displayName: "Rejected From" });
      const toUser = await createTestUser({ displayName: "Rejected To" });
      const { agent, apiKey } = await createTestAgent(toUser.id);

      const connReq = await db.connectionRequest.create({
        data: {
          fromUserId: fromUser.id,
          toUserId: toUser.id,
          category: "SOCIAL",
          intent: "Let's hang out",
        },
      });

      const { event } = await createTestAgentEvent({
        agentId: agent.id,
        type: "CONNECTION_REQUEST",
        connectionRequestId: connReq.id,
        payload: { requestId: connReq.id },
      });

      const req = buildDecideRequest(event.id, apiKey, {
        decision: "REJECT",
        reason: "Not a good fit right now",
      });

      const res = await decideEvent(req, {
        params: Promise.resolve({ id: event.id }),
      });
      expect(res.status).toBe(200);

      const updatedReq = await db.connectionRequest.findUnique({
        where: { id: connReq.id },
      });
      expect(updatedReq!.status).toBe("REJECTED");

      // Verify rejection notifications
      const notifications = await db.notification.findMany();
      expect(notifications.length).toBeGreaterThanOrEqual(2);
      const rejectionNotif = notifications.find(
        (n) => n.type === "CONNECTION_REJECTED",
      );
      expect(rejectionNotif).toBeDefined();
      expect(rejectionNotif!.userId).toBe(fromUser.id);
    });

    it("should handle ASK_MORE decision with conversation creation", async () => {
      const fromUser = await createTestUser({ displayName: "Curious From" });
      const toUser = await createTestUser({ displayName: "Curious To" });
      const { agent, apiKey } = await createTestAgent(toUser.id);

      const connReq = await db.connectionRequest.create({
        data: {
          fromUserId: fromUser.id,
          toUserId: toUser.id,
          category: "BUSINESS",
          intent: "Business opportunity",
        },
      });

      const { event } = await createTestAgentEvent({
        agentId: agent.id,
        type: "CONNECTION_REQUEST",
        connectionRequestId: connReq.id,
        payload: { requestId: connReq.id },
      });

      const req = buildDecideRequest(event.id, apiKey, {
        decision: "ASK_MORE",
        reason: "Can you tell me more about your business?",
      });

      const res = await decideEvent(req, {
        params: Promise.resolve({ id: event.id }),
      });
      expect(res.status).toBe(200);

      // Status should be IN_CONVERSATION
      const updatedReq = await db.connectionRequest.findUnique({
        where: { id: connReq.id },
      });
      expect(updatedReq!.status).toBe("IN_CONVERSATION");

      // Should have created a new conversation with a message
      const conversations = await db.agentConversation.findMany({
        where: { connectionRequestId: connReq.id },
        include: { messages: true },
      });
      // The event creation already creates one, plus the ASK_MORE creates another
      const withMessages = conversations.filter((c) => c.messages.length > 0);
      expect(withMessages.length).toBeGreaterThanOrEqual(1);
      const agentMessage = withMessages[0].messages.find(
        (m) => m.role === "AGENT",
      );
      expect(agentMessage).toBeDefined();
      expect(agentMessage!.content).toBe(
        "Can you tell me more about your business?",
      );
    });

    it("should return 409 for already-decided event", async () => {
      const user = await createTestUser({ displayName: "Already Decided" });
      const { agent, apiKey } = await createTestAgent(user.id);

      const { event } = await createTestAgentEvent({
        agentId: agent.id,
        type: "CONNECTION_REQUEST",
        payload: { test: true },
      });

      // Mark event as already decided
      await db.agentEvent.update({
        where: { id: event.id },
        data: { status: "DECIDED" },
      });

      const req = buildDecideRequest(event.id, apiKey, {
        decision: "ACCEPT",
      });

      const res = await decideEvent(req, {
        params: Promise.resolve({ id: event.id }),
      });
      expect(res.status).toBe(409);
    });

    it("should return 410 for expired event", async () => {
      const user = await createTestUser({ displayName: "Expired User" });
      const { agent, apiKey } = await createTestAgent(user.id);

      const { event } = await createTestAgentEvent({
        agentId: agent.id,
        type: "CONNECTION_REQUEST",
        payload: { test: true },
        expiresInMs: -1000,
      });

      const req = buildDecideRequest(event.id, apiKey, {
        decision: "ACCEPT",
      });

      const res = await decideEvent(req, {
        params: Promise.resolve({ id: event.id }),
      });
      expect(res.status).toBe(410);
    });

    it("should return 403 when agent tries to decide another agent's event", async () => {
      const user1 = await createTestUser({ displayName: "Agent Owner 1" });
      const user2 = await createTestUser({ displayName: "Agent Owner 2" });
      const { agent: agent1 } = await createTestAgent(user1.id);
      const { apiKey: apiKey2 } = await createTestAgent(user2.id, "Other Agent");

      const { event } = await createTestAgentEvent({
        agentId: agent1.id,
        type: "CONNECTION_REQUEST",
        payload: { test: true },
      });

      const req = buildDecideRequest(event.id, apiKey2, {
        decision: "ACCEPT",
      });

      const res = await decideEvent(req, {
        params: Promise.resolve({ id: event.id }),
      });
      expect(res.status).toBe(403);
    });
  });
});
