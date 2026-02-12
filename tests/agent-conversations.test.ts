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

import { POST as replyToEvent } from "@/app/api/v1/agent/events/[id]/reply/route";

describe("Agent Conversations & Replies", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("should reply to an event using an existing conversation", async () => {
    const user = await createTestUser({ displayName: "Reply User" });
    const { agent, apiKey } = await createTestAgent(user.id);

    const { event, conversation } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    const req = new NextRequest(
      `http://localhost/api/v1/agent/events/${event.id}/reply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ content: "Tell me more about your interests." }),
      },
    );

    const res = await replyToEvent(req, {
      params: Promise.resolve({ id: event.id }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.conversationId).toBe(conversation.id);

    // Verify the message was created
    const messages = await db.agentMessage.findMany({
      where: { conversationId: conversation.id },
    });
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe("AGENT");
    expect(messages[0].content).toBe("Tell me more about your interests.");
  });

  it("should create a new conversation if event has none", async () => {
    const user = await createTestUser({ displayName: "New Conv User" });
    const { agent, apiKey } = await createTestAgent(user.id);

    // Create an event without a linked conversation
    const event = await db.agentEvent.create({
      data: {
        externalAgentId: agent.id,
        type: "CONNECTION_REQUEST",
        payload: { test: true },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const req = new NextRequest(
      `http://localhost/api/v1/agent/events/${event.id}/reply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ content: "Hello, creating a conversation!" }),
      },
    );

    const res = await replyToEvent(req, {
      params: Promise.resolve({ id: event.id }),
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.conversationId).toBeDefined();

    // Verify the event now has a conversationId
    const updatedEvent = await db.agentEvent.findUnique({
      where: { id: event.id },
    });
    expect(updatedEvent!.conversationId).toBe(body.conversationId);

    // Verify conversation and message exist
    const conversation = await db.agentConversation.findUnique({
      where: { id: body.conversationId },
      include: { messages: true },
    });
    expect(conversation).not.toBeNull();
    expect(conversation!.messages).toHaveLength(1);
    expect(conversation!.messages[0].content).toBe(
      "Hello, creating a conversation!",
    );
  });

  it("should support multiple replies in the same conversation", async () => {
    const user = await createTestUser({ displayName: "Multi Reply" });
    const { agent, apiKey } = await createTestAgent(user.id);

    const { event, conversation } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    // Send three replies
    for (const content of ["Message 1", "Message 2", "Message 3"]) {
      const req = new NextRequest(
        `http://localhost/api/v1/agent/events/${event.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ content }),
        },
      );

      const res = await replyToEvent(req, {
        params: Promise.resolve({ id: event.id }),
      });
      expect(res.status).toBe(200);
    }

    // Verify all three messages exist
    const messages = await db.agentMessage.findMany({
      where: { conversationId: conversation.id },
      orderBy: { createdAt: "asc" },
    });
    expect(messages).toHaveLength(3);
    expect(messages.map((m) => m.content)).toEqual([
      "Message 1",
      "Message 2",
      "Message 3",
    ]);
  });

  it("should return 410 for expired event replies", async () => {
    const user = await createTestUser({ displayName: "Expired Reply" });
    const { agent, apiKey } = await createTestAgent(user.id);

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
      expiresInMs: -1000,
    });

    const req = new NextRequest(
      `http://localhost/api/v1/agent/events/${event.id}/reply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ content: "Too late!" }),
      },
    );

    const res = await replyToEvent(req, {
      params: Promise.resolve({ id: event.id }),
    });
    expect(res.status).toBe(410);
  });

  it("should return 403 when agent replies to another agent's event", async () => {
    const user1 = await createTestUser({ displayName: "Owner 1" });
    const user2 = await createTestUser({ displayName: "Owner 2" });
    const { agent: agent1 } = await createTestAgent(user1.id);
    const { apiKey: apiKey2 } = await createTestAgent(user2.id, "Other");

    const { event } = await createTestAgentEvent({
      agentId: agent1.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    const req = new NextRequest(
      `http://localhost/api/v1/agent/events/${event.id}/reply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey2}`,
        },
        body: JSON.stringify({ content: "Hijack attempt" }),
      },
    );

    const res = await replyToEvent(req, {
      params: Promise.resolve({ id: event.id }),
    });
    expect(res.status).toBe(403);
  });

  it("should return 400 for invalid reply content", async () => {
    const user = await createTestUser({ displayName: "Bad Reply" });
    const { agent, apiKey } = await createTestAgent(user.id);

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    const req = new NextRequest(
      `http://localhost/api/v1/agent/events/${event.id}/reply`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ content: "" }), // Empty content should fail validation
      },
    );

    const res = await replyToEvent(req, {
      params: Promise.resolve({ id: event.id }),
    });
    expect(res.status).toBe(400);
  });
});
