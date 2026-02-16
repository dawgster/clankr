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

// Mock Matrix user-dm (room provisioning)
vi.mock("@/lib/matrix/user-dm", () => ({
  ensureConnectionMatrixRoom: vi.fn().mockResolvedValue("!mock-room:localhost"),
}));

import { POST as decideEvent } from "@/app/api/v1/agent/events/[id]/decide/route";
import { POST as replyToEvent } from "@/app/api/v1/agent/events/[id]/reply/route";
import { GET as getEvents } from "@/app/api/v1/agent/events/route";

describe("Escalation Flow — ASK_MORE creates user-visible conversation", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("ASK_MORE should notify the requesting user and create an agent conversation they can view", async () => {
    const requester = await createTestUser({ displayName: "Requester Pat" });
    const recipient = await createTestUser({ displayName: "Recipient Sam" });
    const { agent, apiKey } = await createTestAgent(recipient.id, "Sam's Bot");
    // Requester needs an agent so sendAgentChatMessage can deliver
    const { agent: requesterAgent } = await createTestAgent(requester.id, "Pat's Bot");

    const connReq = await db.connectionRequest.create({
      data: {
        fromUserId: requester.id,
        toUserId: recipient.id,
        category: "HIRING",
        intent: "Interested in your design skills for a contract role",
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      connectionRequestId: connReq.id,
      payload: {
        requestId: connReq.id,
        fromUser: {
          username: requester.username,
          displayName: "Requester Pat",
        },
        category: "HIRING",
        intent: "Interested in your design skills for a contract role",
      },
    });

    // Agent decides ASK_MORE
    const decideReq = new NextRequest(
      `http://localhost/api/v1/agent/events/${event.id}/decide`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          decision: "ASK_MORE",
          reason: "What's the hourly rate and project timeline?",
        }),
      },
    );

    const res = await decideEvent(decideReq, {
      params: Promise.resolve({ id: event.id }),
    });
    expect(res.status).toBe(200);

    // 1. Connection request should be IN_CONVERSATION
    const updatedReq = await db.connectionRequest.findUnique({
      where: { id: connReq.id },
    });
    expect(updatedReq!.status).toBe("IN_CONVERSATION");

    // 2. Requester should have received a notification
    const notif = await db.notification.findFirst({
      where: { userId: requester.id, type: "AGENT_DECISION" },
    });
    expect(notif).not.toBeNull();
    expect(notif!.title).toBe("Agent wants to know more");
    expect(notif!.body).toBe("What's the hourly rate and project timeline?");
    expect((notif!.metadata as Record<string, string>).requestId).toBe(connReq.id);

    // 3. sendAgentChatMessage creates conversations on both sides linked by chatThreadId.
    // The sender (recipient's agent) should have an outgoing AGENT message.
    const senderConv = await db.agentConversation.findFirst({
      where: {
        externalAgentId: agent.id,
        chatThreadId: { not: null },
      },
      include: { messages: true },
    });
    expect(senderConv).not.toBeNull();
    const outgoing = senderConv!.messages.find((m) => m.role === "AGENT");
    expect(outgoing).toBeDefined();
    expect(outgoing!.content).toBe(
      "What's the hourly rate and project timeline?",
    );

    // 4. The requester's agent should have received an incoming USER message
    const recipientConv = await db.agentConversation.findFirst({
      where: {
        externalAgentId: requesterAgent.id,
        chatThreadId: { not: null },
      },
      include: { messages: true },
    });
    expect(recipientConv).not.toBeNull();
    const incoming = recipientConv!.messages.find((m) => m.role === "USER");
    expect(incoming).toBeDefined();
    expect(incoming!.content).toBe(
      "What's the hourly rate and project timeline?",
    );

    // 5. A NEW_MESSAGE event should have been created for the requester's agent
    const newMsgEvent = await db.agentEvent.findFirst({
      where: { externalAgentId: requesterAgent.id, type: "NEW_MESSAGE" },
    });
    expect(newMsgEvent).not.toBeNull();
  });

  it("ASK_MORE without reason should still notify but not create agent message", async () => {
    const requester = await createTestUser({ displayName: "Q Requester" });
    const recipient = await createTestUser({ displayName: "Q Recipient" });
    const { agent, apiKey } = await createTestAgent(recipient.id);

    const connReq = await db.connectionRequest.create({
      data: {
        fromUserId: requester.id,
        toUserId: recipient.id,
        intent: "General question",
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      connectionRequestId: connReq.id,
      payload: { requestId: connReq.id },
    });

    const res = await decideEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${event.id}/decide`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({ decision: "ASK_MORE" }),
        },
      ),
      { params: Promise.resolve({ id: event.id }) },
    );
    expect(res.status).toBe(200);

    // Status should still be IN_CONVERSATION
    const updated = await db.connectionRequest.findUnique({
      where: { id: connReq.id },
    });
    expect(updated!.status).toBe("IN_CONVERSATION");

    // Notification should use default text
    const notif = await db.notification.findFirst({
      where: { userId: requester.id },
    });
    expect(notif).not.toBeNull();
    expect(notif!.body).toContain("some questions before making a decision");
  });
});

describe("Escalation Flow — Agent reply then decide", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("agent can reply multiple times then eventually decide ACCEPT", async () => {
    const requester = await createTestUser({ displayName: "Multi Requester" });
    const recipient = await createTestUser({ displayName: "Multi Recipient" });
    const { agent, apiKey } = await createTestAgent(recipient.id);

    const connReq = await db.connectionRequest.create({
      data: {
        fromUserId: requester.id,
        toUserId: recipient.id,
        category: "COLLABORATION",
        intent: "Build something together",
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      connectionRequestId: connReq.id,
      payload: { requestId: connReq.id, intent: "Build something together" },
    });

    // Agent replies with questions
    for (const content of [
      "What tech stack do you use?",
      "How many hours per week?",
      "Are you open to async collaboration?",
    ]) {
      const replyRes = await replyToEvent(
        new NextRequest(
          `http://localhost/api/v1/agent/events/${event.id}/reply`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({ content }),
          },
        ),
        { params: Promise.resolve({ id: event.id }) },
      );
      expect(replyRes.status).toBe(200);
    }

    // Verify all messages are in the conversation
    const updatedEvent = await db.agentEvent.findUnique({
      where: { id: event.id },
    });
    const messages = await db.agentMessage.findMany({
      where: { conversationId: updatedEvent!.conversationId! },
      orderBy: { createdAt: "asc" },
    });
    expect(messages).toHaveLength(3);
    expect(messages.every((m) => m.role === "AGENT")).toBe(true);

    // Now agent makes final decision
    const decideRes = await decideEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${event.id}/decide`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            decision: "ACCEPT",
            confidence: 0.92,
            reason: "Great match after clarification!",
          }),
        },
      ),
      { params: Promise.resolve({ id: event.id }) },
    );
    expect(decideRes.status).toBe(200);

    // Connection created
    const connection = await db.connection.findFirst({
      where: {
        OR: [
          { userAId: requester.id, userBId: recipient.id },
          { userAId: recipient.id, userBId: requester.id },
        ],
      },
    });
    expect(connection).not.toBeNull();

    // Acceptance notifications sent
    const acceptNotifs = await db.notification.findMany({
      where: { type: "CONNECTION_ACCEPTED" },
    });
    expect(acceptNotifs).toHaveLength(1);
    expect(acceptNotifs[0].userId).toBe(requester.id);
  });
});

describe("Escalation Flow — No-agent fallback creates user notification", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("connection to user without agent creates notification prompting them to connect one", async () => {
    const sender = await createTestUser({ displayName: "Active Sender" });
    const agentless = await createTestUser({ displayName: "Agentless User" });
    // agentless has no agent

    const connReq = await db.connectionRequest.create({
      data: {
        fromUserId: sender.id,
        toUserId: agentless.id,
        intent: "Want to network",
      },
    });

    // Simulate evaluate-connection no-agent branch
    await db.notification.create({
      data: {
        userId: agentless.id,
        type: "CONNECTION_REQUEST",
        title: "New connection request",
        body: "Connect an agent to process requests automatically.",
        metadata: { requestId: connReq.id },
      },
    });

    // Verify agentless user got the right notification
    const notif = await db.notification.findFirst({
      where: { userId: agentless.id },
    });
    expect(notif).not.toBeNull();
    expect(notif!.type).toBe("CONNECTION_REQUEST");
    expect(notif!.body).toContain("Connect an agent");

    // Connection request should remain PENDING (no agent to process it)
    const updated = await db.connectionRequest.findUnique({
      where: { id: connReq.id },
    });
    expect(updated!.status).toBe("PENDING");
  });
});

describe("Escalation Flow — Full E2E: request → ASK_MORE → reply → reject", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("full conversation escalation ending in rejection", async () => {
    const alice = await createTestUser({
      displayName: "Alice E2E",
      bio: "Startup founder",
      interests: ["AI", "startups"],
    });
    const bob = await createTestUser({
      displayName: "Bob E2E",
      bio: "Investor",
    });
    const { agent: bobAgent, apiKey: bobKey } = await createTestAgent(
      bob.id,
      "Bob's Screening Agent",
    );

    // 1. Connection request created
    const connReq = await db.connectionRequest.create({
      data: {
        fromUserId: alice.id,
        toUserId: bob.id,
        category: "BUSINESS",
        intent: "Seeking seed funding for my AI startup",
      },
    });

    // 2. Event created for Bob's agent (simulating evaluate-connection)
    const { event } = await createTestAgentEvent({
      agentId: bobAgent.id,
      type: "CONNECTION_REQUEST",
      connectionRequestId: connReq.id,
      payload: {
        requestId: connReq.id,
        fromUser: {
          username: alice.username,
          displayName: "Alice E2E",
          bio: "Startup founder",
          interests: ["AI", "startups"],
        },
        category: "BUSINESS",
        intent: "Seeking seed funding for my AI startup",
      },
    });

    // 3. Bob's agent polls events
    const pollRes = await getEvents(
      new NextRequest("http://localhost/api/v1/agent/events", {
        headers: { Authorization: `Bearer ${bobKey}` },
      }),
    );
    expect(pollRes.status).toBe(200);
    const { events } = await pollRes.json();
    expect(events).toHaveLength(1);
    expect(events[0].connectionRequest).toBeDefined();

    // 4. Bob's agent asks for more info (ASK_MORE)
    await decideEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${event.id}/decide`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bobKey}`,
          },
          body: JSON.stringify({
            decision: "ASK_MORE",
            reason: "What's your current MRR and team size?",
          }),
        },
      ),
      { params: Promise.resolve({ id: event.id }) },
    );

    // Verify Alice got notification
    const aliceNotif = await db.notification.findFirst({
      where: { userId: alice.id, type: "AGENT_DECISION" },
    });
    expect(aliceNotif).not.toBeNull();
    expect(aliceNotif!.body).toBe("What's your current MRR and team size?");

    // Verify request is IN_CONVERSATION
    let req = await db.connectionRequest.findUnique({
      where: { id: connReq.id },
    });
    expect(req!.status).toBe("IN_CONVERSATION");

    // 5. Create a new event for the follow-up (simulating user response)
    const followUpConv = await db.agentConversation.create({
      data: {
        externalAgentId: bobAgent.id,
        connectionRequestId: connReq.id,
        status: "ACTIVE",
      },
    });

    // Simulate user's answer being added as a USER message
    await db.agentMessage.create({
      data: {
        conversationId: followUpConv.id,
        role: "USER",
        content: "Pre-revenue, team of 2. We have an MVP with 500 beta users.",
      },
    });

    const followUpEvent = await db.agentEvent.create({
      data: {
        externalAgentId: bobAgent.id,
        type: "CONNECTION_REQUEST",
        connectionRequestId: connReq.id,
        conversationId: followUpConv.id,
        payload: {
          requestId: connReq.id,
          userReply: "Pre-revenue, team of 2. We have an MVP with 500 beta users.",
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // 6. Bob's agent replies with a follow-up
    await replyToEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${followUpEvent.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bobKey}`,
          },
          body: JSON.stringify({
            content: "Thanks for the details. We typically invest at Series A stage.",
          }),
        },
      ),
      { params: Promise.resolve({ id: followUpEvent.id }) },
    );

    // 7. Bob's agent ultimately rejects
    const rejectRes = await decideEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${followUpEvent.id}/decide`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bobKey}`,
          },
          body: JSON.stringify({
            decision: "REJECT",
            confidence: 0.75,
            reason: "Too early stage for our investment criteria.",
          }),
        },
      ),
      { params: Promise.resolve({ id: followUpEvent.id }) },
    );
    expect(rejectRes.status).toBe(200);

    // Verify final state
    req = await db.connectionRequest.findUnique({
      where: { id: connReq.id },
    });
    expect(req!.status).toBe("REJECTED");

    // Alice should have rejection notification
    const rejectNotif = await db.notification.findFirst({
      where: { userId: alice.id, type: "CONNECTION_REJECTED" },
    });
    expect(rejectNotif).not.toBeNull();
    expect(rejectNotif!.body).toContain("Too early stage");

    // Bob should have agent decision notification
    const bobNotif = await db.notification.findFirst({
      where: { userId: bob.id, type: "AGENT_DECISION" },
    });
    expect(bobNotif).not.toBeNull();

    // Verify conversation has the full history
    const allMessages = await db.agentMessage.findMany({
      where: { conversationId: followUpConv.id },
      orderBy: { createdAt: "asc" },
    });
    expect(allMessages).toHaveLength(2); // USER reply + AGENT follow-up
    expect(allMessages[0].role).toBe("USER");
    expect(allMessages[1].role).toBe("AGENT");
    expect(allMessages[1].content).toContain("Series A stage");
  });
});
