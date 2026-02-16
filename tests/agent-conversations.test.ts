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

vi.mock("@/lib/agent-chat", () => ({
  sendAgentChatMessage: vi.fn(),
}));

import { inngest } from "@/inngest/client";
import { sendAgentChatMessage } from "@/lib/agent-chat";
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

  it("should return 400 for NEW_MESSAGE events when agent is unclaimed", async () => {
    const sender = await createTestUser({ displayName: "Sender User" });
    const { key, hash, prefix } = await import("@/lib/agent-auth").then((m) =>
      m.generateApiKey(),
    );

    const agent = await db.externalAgent.create({
      data: {
        name: "Unclaimed Reply Agent",
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        status: "ACTIVE",
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "NEW_MESSAGE",
      payload: { senderUserId: sender.id, chatThreadId: "thread-1" },
    });

    const res = await replyToEvent(
      new NextRequest(`http://localhost/api/v1/agent/events/${event.id}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ content: "Should fail because unclaimed" }),
      }),
      { params: Promise.resolve({ id: event.id }) },
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Agent not claimed");
    expect(vi.mocked(sendAgentChatMessage)).not.toHaveBeenCalled();
  });

  it("should return 400 for NEW_MESSAGE events with invalid payload", async () => {
    const owner = await createTestUser({ displayName: "Payload Owner" });
    const { agent, apiKey } = await createTestAgent(owner.id, "Payload Agent");

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "NEW_MESSAGE",
      payload: { chatThreadId: "thread-without-sender" },
    });

    const res = await replyToEvent(
      new NextRequest(`http://localhost/api/v1/agent/events/${event.id}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ content: "Missing sender in payload" }),
      }),
      { params: Promise.resolve({ id: event.id }) },
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid event payload");
    expect(vi.mocked(sendAgentChatMessage)).not.toHaveBeenCalled();
  });

  it("should process NEW_MESSAGE reply, mark event DECIDED, and dispatch follow-up event", async () => {
    const sender = await createTestUser({ displayName: "Origin User" });
    const recipient = await createTestUser({ displayName: "Reply Owner" });
    const { agent, apiKey } = await createTestAgent(recipient.id, "Reply Agent");

    const { event, conversation } = await createTestAgentEvent({
      agentId: agent.id,
      type: "NEW_MESSAGE",
      payload: { senderUserId: sender.id, chatThreadId: "thread-abc" },
    });

    vi.mocked(sendAgentChatMessage).mockResolvedValue({
      eventId: "evt-follow-up",
      chatThreadId: "thread-abc",
    });

    const res = await replyToEvent(
      new NextRequest(`http://localhost/api/v1/agent/events/${event.id}/reply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ content: "Thanks, tell me more." }),
      }),
      { params: Promise.resolve({ id: event.id }) },
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, conversationId: conversation.id });

    const updatedEvent = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updatedEvent!.status).toBe("DECIDED");
    expect(updatedEvent!.decision).toEqual({ action: "REPLY" });

    // Message recording is delegated to sendAgentChatMessage (no local recording)
    const messages = await db.agentMessage.findMany({
      where: { conversationId: conversation.id },
    });
    expect(messages).toHaveLength(0);

    expect(vi.mocked(sendAgentChatMessage)).toHaveBeenCalledWith(
      { id: agent.id, userId: recipient.id },
      sender.id,
      "Thanks, tell me more.",
    );
    expect(vi.mocked(inngest.send)).toHaveBeenCalledWith({
      name: "agent/event.created",
      data: { eventId: "evt-follow-up" },
    });
  });
});
