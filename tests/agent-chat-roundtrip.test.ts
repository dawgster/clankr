import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent } from "./helpers/seed";

// Mock inngest only (NOT sendAgentChatMessage — we need the real implementation)
vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

// Mock Matrix room provisioning
vi.mock("@/lib/matrix/user-dm", () => ({
  ensureConnectionMatrixRoom: vi.fn().mockResolvedValue("!mock-room:localhost"),
}));

import { POST as agentConnect } from "@/app/api/v1/agent/connect/route";
import { GET as getEvents } from "@/app/api/v1/agent/events/route";
import { POST as replyToEvent } from "@/app/api/v1/agent/events/[id]/reply/route";
import { POST as agentMessage } from "@/app/api/v1/agent/message/route";

describe("Agent-to-agent chat roundtrip", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("initiating agent receives NEW_MESSAGE event when recipient replies to CONNECTION_REQUEST", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const bob = await createTestUser({ displayName: "Bob" });
    const { agent: aliceAgent, apiKey: aliceKey } = await createTestAgent(alice.id, "Alice Agent");
    const { agent: bobAgent, apiKey: bobKey } = await createTestAgent(bob.id, "Bob Agent");

    // Alice's agent sends connection request to Bob
    const connectRes = await agentConnect(
      new NextRequest("http://localhost/api/v1/agent/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({
          toUserId: bob.id,
          category: "COLLABORATION",
          intent: "Let's work together!",
        }),
      }),
    );
    expect(connectRes.status).toBe(200);

    // Bob's agent polls and sees the CONNECTION_REQUEST event
    const bobPollRes = await getEvents(
      new NextRequest("http://localhost/api/v1/agent/events", {
        headers: { Authorization: `Bearer ${bobKey}` },
      }),
    );
    const { events: bobEvents } = await bobPollRes.json();
    expect(bobEvents).toHaveLength(1);
    const bobEventId = bobEvents[0].id;

    // Alice has no events yet
    const alicePollBefore = await getEvents(
      new NextRequest("http://localhost/api/v1/agent/events", {
        headers: { Authorization: `Bearer ${aliceKey}` },
      }),
    );
    expect((await alicePollBefore.json()).events).toHaveLength(0);

    // Bob replies to the CONNECTION_REQUEST
    const replyRes = await replyToEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${bobEventId}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bobKey}`,
          },
          body: JSON.stringify({ content: "Sure! What kind of collaboration?" }),
        },
      ),
      { params: Promise.resolve({ id: bobEventId }) },
    );
    expect(replyRes.status).toBe(200);

    // Alice now sees a NEW_MESSAGE event with the reply
    const alicePollAfter = await getEvents(
      new NextRequest("http://localhost/api/v1/agent/events", {
        headers: { Authorization: `Bearer ${aliceKey}` },
      }),
    );
    const { events: aliceEventsAfter } = await alicePollAfter.json();
    expect(aliceEventsAfter).toHaveLength(1);
    expect(aliceEventsAfter[0].type).toBe("NEW_MESSAGE");
    expect(aliceEventsAfter[0].payload.content).toBe("Sure! What kind of collaboration?");
    expect(aliceEventsAfter[0].payload.senderUserId).toBe(bob.id);
  });

  it("CONNECTION_REQUEST reply reuses conversation instead of creating a new one", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const bob = await createTestUser({ displayName: "Bob" });
    const { agent: aliceAgent, apiKey: aliceKey } = await createTestAgent(alice.id, "Alice Agent");
    const { agent: bobAgent, apiKey: bobKey } = await createTestAgent(bob.id, "Bob Agent");

    // Alice connects to Bob
    await agentConnect(
      new NextRequest("http://localhost/api/v1/agent/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({
          toUserId: bob.id,
          intent: "Let's collaborate!",
        }),
      }),
    );

    // Bob polls and replies
    const bobPoll = await getEvents(
      new NextRequest("http://localhost/api/v1/agent/events", {
        headers: { Authorization: `Bearer ${bobKey}` },
      }),
    );
    const bobEventId = (await bobPoll.json()).events[0].id;

    await replyToEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${bobEventId}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bobKey}`,
          },
          body: JSON.stringify({ content: "Sounds great!" }),
        },
      ),
      { params: Promise.resolve({ id: bobEventId }) },
    );

    // Bob should have exactly ONE conversation (the upgraded CONNECTION_REQUEST conv)
    const bobConversations = await db.agentConversation.findMany({
      where: { externalAgentId: bobAgent.id },
    });
    expect(bobConversations).toHaveLength(1);
    expect(bobConversations[0].chatThreadId).not.toBeNull();
    expect(bobConversations[0].peerUserId).toBe(alice.id);
    expect(bobConversations[0].connectionRequestId).not.toBeNull();

    // Alice should have exactly ONE conversation (created by sendAgentChatMessage)
    const aliceConversations = await db.agentConversation.findMany({
      where: { externalAgentId: aliceAgent.id },
    });
    expect(aliceConversations).toHaveLength(1);
    expect(aliceConversations[0].chatThreadId).toBe(bobConversations[0].chatThreadId);
    expect(aliceConversations[0].peerUserId).toBe(bob.id);

    // Both should have exactly one message each (no duplicates)
    const bobMessages = await db.agentMessage.findMany({
      where: { conversationId: bobConversations[0].id },
    });
    expect(bobMessages).toHaveLength(1);
    expect(bobMessages[0].role).toBe("AGENT");
    expect(bobMessages[0].content).toBe("Sounds great!");

    const aliceMessages = await db.agentMessage.findMany({
      where: { conversationId: aliceConversations[0].id },
    });
    expect(aliceMessages).toHaveLength(1);
    expect(aliceMessages[0].role).toBe("USER");
    expect(aliceMessages[0].content).toBe("Sounds great!");
  });

  it("direct message reply does not create duplicate messages", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const bob = await createTestUser({ displayName: "Bob" });
    const { agent: aliceAgent, apiKey: aliceKey } = await createTestAgent(alice.id, "Alice Agent");
    const { agent: bobAgent, apiKey: bobKey } = await createTestAgent(bob.id, "Bob Agent");

    await db.connection.create({
      data: { userAId: alice.id, userBId: bob.id },
    });

    // Alice sends a direct message
    await agentMessage(
      new NextRequest("http://localhost/api/v1/agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({ userId: bob.id, content: "Hey Bob!" }),
      }),
    );

    // Bob polls and replies
    const bobPoll = await getEvents(
      new NextRequest("http://localhost/api/v1/agent/events", {
        headers: { Authorization: `Bearer ${bobKey}` },
      }),
    );
    const bobEventId = (await bobPoll.json()).events[0].id;

    await replyToEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${bobEventId}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bobKey}`,
          },
          body: JSON.stringify({ content: "Hey Alice!" }),
        },
      ),
      { params: Promise.resolve({ id: bobEventId }) },
    );

    // Bob should have exactly ONE conversation with exactly 2 messages
    const bobConversations = await db.agentConversation.findMany({
      where: { externalAgentId: bobAgent.id },
    });
    expect(bobConversations).toHaveLength(1);

    const bobMessages = await db.agentMessage.findMany({
      where: { conversationId: bobConversations[0].id },
      orderBy: { createdAt: "asc" },
    });
    expect(bobMessages).toHaveLength(2);
    expect(bobMessages[0]).toMatchObject({ role: "USER", content: "Hey Bob!" });
    expect(bobMessages[1]).toMatchObject({ role: "AGENT", content: "Hey Alice!" });

    // Alice should have exactly ONE conversation with exactly 2 messages
    const aliceConversations = await db.agentConversation.findMany({
      where: { externalAgentId: aliceAgent.id },
    });
    expect(aliceConversations).toHaveLength(1);

    const aliceMessages = await db.agentMessage.findMany({
      where: { conversationId: aliceConversations[0].id },
      orderBy: { createdAt: "asc" },
    });
    expect(aliceMessages).toHaveLength(2);
    expect(aliceMessages[0]).toMatchObject({ role: "AGENT", content: "Hey Bob!" });
    expect(aliceMessages[1]).toMatchObject({ role: "USER", content: "Hey Alice!" });
  });

  it("multi-turn conversation: agents exchange messages in consistent threads", async () => {
    const alice = await createTestUser({ displayName: "Alice" });
    const bob = await createTestUser({ displayName: "Bob" });
    const { agent: aliceAgent, apiKey: aliceKey } = await createTestAgent(alice.id, "Alice Agent");
    const { agent: bobAgent, apiKey: bobKey } = await createTestAgent(bob.id, "Bob Agent");

    await db.connection.create({
      data: { userAId: alice.id, userBId: bob.id },
    });

    // Turn 1: Alice → Bob
    await agentMessage(
      new NextRequest("http://localhost/api/v1/agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({ userId: bob.id, content: "Message 1 from Alice" }),
      }),
    );

    // Bob polls and replies
    const bobPoll1 = await getEvents(
      new NextRequest("http://localhost/api/v1/agent/events", {
        headers: { Authorization: `Bearer ${bobKey}` },
      }),
    );
    const bobEvent1 = (await bobPoll1.json()).events[0];

    await replyToEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${bobEvent1.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bobKey}`,
          },
          body: JSON.stringify({ content: "Reply 1 from Bob" }),
        },
      ),
      { params: Promise.resolve({ id: bobEvent1.id }) },
    );

    // Turn 2: Alice polls, sees reply, replies back
    const alicePoll1 = await getEvents(
      new NextRequest("http://localhost/api/v1/agent/events", {
        headers: { Authorization: `Bearer ${aliceKey}` },
      }),
    );
    const aliceEvent1 = (await alicePoll1.json()).events[0];
    expect(aliceEvent1.payload.content).toBe("Reply 1 from Bob");

    await replyToEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${aliceEvent1.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${aliceKey}`,
          },
          body: JSON.stringify({ content: "Message 2 from Alice" }),
        },
      ),
      { params: Promise.resolve({ id: aliceEvent1.id }) },
    );

    // Bob sees Alice's second message
    const bobPoll2 = await getEvents(
      new NextRequest("http://localhost/api/v1/agent/events", {
        headers: { Authorization: `Bearer ${bobKey}` },
      }),
    );
    const bobEvent2 = (await bobPoll2.json()).events[0];
    expect(bobEvent2.payload.content).toBe("Message 2 from Alice");

    // Verify: each agent has exactly ONE conversation (consistent thread)
    const aliceConvs = await db.agentConversation.findMany({
      where: { externalAgentId: aliceAgent.id },
    });
    const bobConvs = await db.agentConversation.findMany({
      where: { externalAgentId: bobAgent.id },
    });
    expect(aliceConvs).toHaveLength(1);
    expect(bobConvs).toHaveLength(1);
    expect(aliceConvs[0].chatThreadId).toBe(bobConvs[0].chatThreadId);

    // Verify message counts (3 messages each: A→B, B→A, A→B)
    const aliceMessages = await db.agentMessage.findMany({
      where: { conversationId: aliceConvs[0].id },
      orderBy: { createdAt: "asc" },
    });
    expect(aliceMessages).toHaveLength(3);
    expect(aliceMessages.map((m) => m.role)).toEqual(["AGENT", "USER", "AGENT"]);

    const bobMessages = await db.agentMessage.findMany({
      where: { conversationId: bobConvs[0].id },
      orderBy: { createdAt: "asc" },
    });
    expect(bobMessages).toHaveLength(3);
    expect(bobMessages.map((m) => m.role)).toEqual(["USER", "AGENT", "USER"]);
  });
});
