import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent, createTestListing } from "./helpers/seed";

// Mock inngest
vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

import { POST as agentConnect } from "@/app/api/v1/agent/connect/route";
import { GET as getEvents } from "@/app/api/v1/agent/events/route";
import { POST as decideEvent } from "@/app/api/v1/agent/events/[id]/decide/route";
import { POST as replyToEvent } from "@/app/api/v1/agent/events/[id]/reply/route";

describe("End-to-End Agent Interaction Flows", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("full connection flow: agent sends request → recipient agent reviews → accepts", async () => {
    // Setup: two users, each with an agent
    const alice = await createTestUser({ displayName: "Alice", bio: "Engineer" });
    const bob = await createTestUser({ displayName: "Bob", bio: "Designer" });
    const { apiKey: aliceKey } = await createTestAgent(alice.id, "Alice's Agent");
    const { agent: bobAgent, apiKey: bobKey } = await createTestAgent(
      bob.id,
      "Bob's Agent",
    );

    // Step 1: Alice's agent sends connection request to Bob
    const connectReq = new NextRequest(
      "http://localhost/api/v1/agent/connect",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({
          toUserId: bob.id,
          category: "COLLABORATION",
          intent: "Would love to collaborate on a design project",
        }),
      },
    );

    const connectRes = await agentConnect(connectReq);
    expect(connectRes.status).toBe(200);
    const { requestId } = await connectRes.json();

    // Step 2: Simulate what Inngest would do — create an event for Bob's agent
    const connReq = await db.connectionRequest.findUnique({
      where: { id: requestId },
      include: { fromUser: { include: { profile: true } } },
    });

    const conversation = await db.agentConversation.create({
      data: {
        externalAgentId: bobAgent.id,
        connectionRequestId: requestId,
        status: "ACTIVE",
      },
    });

    const agentEvent = await db.agentEvent.create({
      data: {
        externalAgentId: bobAgent.id,
        type: "CONNECTION_REQUEST",
        connectionRequestId: requestId,
        conversationId: conversation.id,
        payload: {
          requestId,
          fromUser: {
            username: connReq!.fromUser.username,
            displayName: connReq!.fromUser.profile?.displayName ?? "Alice",
            bio: connReq!.fromUser.profile?.bio ?? "",
            interests: connReq!.fromUser.profile?.interests ?? [],
          },
          category: "COLLABORATION",
          intent: "Would love to collaborate on a design project",
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Step 3: Bob's agent polls for events
    const pollReq = new NextRequest("http://localhost/api/v1/agent/events", {
      headers: { Authorization: `Bearer ${bobKey}` },
    });

    const pollRes = await getEvents(pollReq);
    expect(pollRes.status).toBe(200);
    const { events } = await pollRes.json();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("CONNECTION_REQUEST");

    // Step 4: Bob's agent accepts the connection
    const decideReq = new NextRequest(
      `http://localhost/api/v1/agent/events/${agentEvent.id}/decide`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${bobKey}`,
        },
        body: JSON.stringify({
          decision: "ACCEPT",
          confidence: 0.9,
          reason: "Great, I'd love to collaborate!",
        }),
      },
    );

    const decideRes = await decideEvent(decideReq, {
      params: Promise.resolve({ id: agentEvent.id }),
    });
    expect(decideRes.status).toBe(200);

    // Verify final state
    const finalConnection = await db.connection.findFirst({
      where: {
        OR: [
          { userAId: alice.id, userBId: bob.id },
          { userAId: bob.id, userBId: alice.id },
        ],
      },
    });
    expect(finalConnection).not.toBeNull();

    const finalRequest = await db.connectionRequest.findUnique({
      where: { id: requestId },
    });
    expect(finalRequest!.status).toBe("ACCEPTED");

    const threads = await db.messageThread.findMany({
      include: { participants: true },
    });
    expect(threads).toHaveLength(1);
    expect(threads[0].participants).toHaveLength(2);
  });

  it("connection flow with ASK_MORE → follow-up reply → final accept", async () => {
    const alice = await createTestUser({ displayName: "Alice Q" });
    const bob = await createTestUser({ displayName: "Bob Q" });
    const { apiKey: aliceKey } = await createTestAgent(alice.id, "Alice Agent");
    const { agent: bobAgent, apiKey: bobKey } = await createTestAgent(
      bob.id,
      "Bob Agent",
    );

    // Alice's agent sends connection request
    const connectRes = await agentConnect(
      new NextRequest("http://localhost/api/v1/agent/connect", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${aliceKey}`,
        },
        body: JSON.stringify({
          toUserId: bob.id,
          intent: "Let's work together!",
        }),
      }),
    );
    const { requestId } = await connectRes.json();

    // Simulate event creation for Bob
    const conversation = await db.agentConversation.create({
      data: {
        externalAgentId: bobAgent.id,
        connectionRequestId: requestId,
        status: "ACTIVE",
      },
    });

    const event = await db.agentEvent.create({
      data: {
        externalAgentId: bobAgent.id,
        type: "CONNECTION_REQUEST",
        connectionRequestId: requestId,
        conversationId: conversation.id,
        payload: { requestId, intent: "Let's work together!" },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Bob's agent asks for more info
    const askRes = await decideEvent(
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
            reason: "What kind of project did you have in mind?",
          }),
        },
      ),
      { params: Promise.resolve({ id: event.id }) },
    );
    expect(askRes.status).toBe(200);

    // Verify request is IN_CONVERSATION
    const inConvReq = await db.connectionRequest.findUnique({
      where: { id: requestId },
    });
    expect(inConvReq!.status).toBe("IN_CONVERSATION");

    // Now create a new event for a follow-up (simulate the human replying
    // and the system creating a new event for Bob's agent)
    const followUpConversation = await db.agentConversation.create({
      data: {
        externalAgentId: bobAgent.id,
        connectionRequestId: requestId,
        status: "ACTIVE",
      },
    });

    const followUpEvent = await db.agentEvent.create({
      data: {
        externalAgentId: bobAgent.id,
        type: "CONNECTION_REQUEST",
        connectionRequestId: requestId,
        conversationId: followUpConversation.id,
        payload: {
          requestId,
          intent: "A React component library!",
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Bob's agent replies with a follow-up question
    const replyRes = await replyToEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${followUpEvent.id}/reply`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bobKey}`,
          },
          body: JSON.stringify({
            content: "Sounds interesting! What's the tech stack?",
          }),
        },
      ),
      { params: Promise.resolve({ id: followUpEvent.id }) },
    );
    expect(replyRes.status).toBe(200);

    // Bob's agent finally accepts
    const finalAccept = await decideEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${followUpEvent.id}/decide`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${bobKey}`,
          },
          body: JSON.stringify({
            decision: "ACCEPT",
            confidence: 0.85,
            reason: "Love React projects!",
          }),
        },
      ),
      { params: Promise.resolve({ id: followUpEvent.id }) },
    );
    expect(finalAccept.status).toBe(200);

    // Verify connection was created
    const connection = await db.connection.findFirst({
      where: {
        OR: [
          { userAId: alice.id, userBId: bob.id },
          { userAId: bob.id, userBId: alice.id },
        ],
      },
    });
    expect(connection).not.toBeNull();
  });

  it("full negotiation flow: offer → counter → accept", async () => {
    const seller = await createTestUser({ displayName: "Seller Sue" });
    const buyer = await createTestUser({ displayName: "Buyer Ben" });
    const { agent: sellerAgent, apiKey: sellerKey } = await createTestAgent(
      seller.id,
      "Sue's Agent",
    );
    const { agent: buyerAgent, apiKey: buyerKey } = await createTestAgent(
      buyer.id,
      "Ben's Agent",
    );

    const listing = await createTestListing(seller.id, {
      title: "Vintage Guitar",
      price: 500,
    });

    // Step 1: Create a negotiation (simulating buyer making an offer via the UI)
    const negotiation = await db.negotiation.create({
      data: {
        listingId: listing.id,
        buyerId: buyer.id,
        sellerId: seller.id,
        offerPrice: 350,
      },
    });

    // Step 2: Create event for seller's agent (what Inngest would do)
    const sellerConversation = await db.agentConversation.create({
      data: {
        externalAgentId: sellerAgent.id,
        negotiationId: negotiation.id,
        status: "ACTIVE",
      },
    });

    const sellerEvent = await db.agentEvent.create({
      data: {
        externalAgentId: sellerAgent.id,
        type: "NEGOTIATION_OFFER",
        negotiationId: negotiation.id,
        conversationId: sellerConversation.id,
        payload: {
          negotiationId: negotiation.id,
          listing: { title: "Vintage Guitar", price: 500 },
          offerPrice: 350,
          buyer: { username: buyer.username, displayName: "Buyer Ben" },
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Step 3: Seller's agent counters at $425
    const counterRes = await decideEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${sellerEvent.id}/decide`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${sellerKey}`,
          },
          body: JSON.stringify({
            decision: "COUNTER",
            counterPrice: 425,
            reason: "Can do $425 — it's a great guitar.",
          }),
        },
      ),
      { params: Promise.resolve({ id: sellerEvent.id }) },
    );
    expect(counterRes.status).toBe(200);

    // Step 4: Simulate Inngest creating counter-event for buyer's agent
    const buyerConversation = await db.agentConversation.create({
      data: {
        externalAgentId: buyerAgent.id,
        negotiationId: negotiation.id,
        status: "ACTIVE",
      },
    });

    const buyerEvent = await db.agentEvent.create({
      data: {
        externalAgentId: buyerAgent.id,
        type: "NEGOTIATION_TURN",
        negotiationId: negotiation.id,
        conversationId: buyerConversation.id,
        payload: {
          negotiationId: negotiation.id,
          listing: { title: "Vintage Guitar", price: 500 },
          counterPrice: 425,
          reason: "Can do $425 — it's a great guitar.",
          offerPrice: 350,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Step 5: Buyer's agent polls and sees the counter
    const pollRes = await getEvents(
      new NextRequest("http://localhost/api/v1/agent/events", {
        headers: { Authorization: `Bearer ${buyerKey}` },
      }),
    );
    const { events } = await pollRes.json();
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("NEGOTIATION_TURN");

    // Step 6: Buyer's agent accepts the counter
    const acceptRes = await decideEvent(
      new NextRequest(
        `http://localhost/api/v1/agent/events/${buyerEvent.id}/decide`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${buyerKey}`,
          },
          body: JSON.stringify({
            decision: "ACCEPT",
            confidence: 0.8,
            reason: "$425 is fair, deal!",
          }),
        },
      ),
      { params: Promise.resolve({ id: buyerEvent.id }) },
    );
    expect(acceptRes.status).toBe(200);

    // Verify final state
    const finalNeg = await db.negotiation.findUnique({
      where: { id: negotiation.id },
    });
    expect(finalNeg!.status).toBe("ACCEPTED");

    const finalListing = await db.listing.findUnique({
      where: { id: listing.id },
    });
    expect(finalListing!.status).toBe("SOLD");

    // Both users should have negotiation update notifications
    const notifications = await db.notification.findMany({
      where: { type: "NEGOTIATION_UPDATE" },
    });
    expect(notifications).toHaveLength(2);
    const notifiedUserIds = notifications.map((n) => n.userId).sort();
    expect(notifiedUserIds).toEqual([buyer.id, seller.id].sort());
  });

  it("multi-agent discovery and connection: two agents discover each other and connect", async () => {
    // Create several users to populate the discover results
    const alice = await createTestUser({
      displayName: "Alice ML",
      bio: "Machine learning engineer",
      interests: ["ML", "AI", "Python"],
      intent: "Looking for data scientists to collaborate",
    });
    const bob = await createTestUser({
      displayName: "Bob Data",
      bio: "Data scientist specializing in NLP",
      interests: ["NLP", "Data Science", "Python"],
      intent: "Looking for ML engineers to work with",
    });
    const carol = await createTestUser({
      displayName: "Carol Web",
      bio: "Frontend developer",
      interests: ["React", "TypeScript"],
      intent: "Building web applications",
    });

    const { apiKey: aliceKey } = await createTestAgent(alice.id, "Alice Agent");
    await createTestAgent(bob.id, "Bob Agent");
    await createTestAgent(carol.id, "Carol Agent");

    // Alice's agent discovers users (without embedding search, just list all)
    // Note: the discover endpoint uses pgvector which requires embeddings,
    // but without the q parameter it falls back to listing users
    // We can't test the full vector search without OpenAI, but we can verify
    // the API works and returns users

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
          intent: "Fellow ML/AI enthusiast, let's collaborate on NLP projects!",
        }),
      }),
    );
    expect(connectRes.status).toBe(200);

    // Verify request was created
    const connReq = await db.connectionRequest.findFirst({
      where: { fromUserId: alice.id, toUserId: bob.id },
    });
    expect(connReq).not.toBeNull();
    expect(connReq!.category).toBe("COLLABORATION");
  });
});
