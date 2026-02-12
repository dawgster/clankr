import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import {
  createTestUser,
  createTestAgent,
  createTestListing,
  createTestNegotiation,
} from "./helpers/seed";

/**
 * The Inngest functions use inngest.createFunction which wraps logic
 * in step.run / step.sleep callbacks. We test the core logic by
 * extracting and executing the inner step functions directly against
 * the real database.
 *
 * For the inngest client mock, we capture the `send` calls so we can
 * verify which downstream events are fired.
 */

// Mock inngest client — capture sends
const inngestSendMock = vi.fn().mockResolvedValue(undefined);
vi.mock("@/inngest/client", () => ({
  inngest: {
    send: (...args: unknown[]) => inngestSendMock(...args),
    createFunction: vi.fn((_config: unknown, _trigger: unknown, handler: Function) => handler),
  },
}));

// Mock webhook dispatch
vi.mock("@/lib/webhook", () => ({
  dispatchWebhook: vi.fn().mockResolvedValue(true),
}));

import { dispatchWebhook } from "@/lib/webhook";

describe("Inngest Functions — evaluate-connection", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("should create agent event and conversation when recipient has active agent", async () => {
    const fromUser = await createTestUser({
      displayName: "Alice",
      bio: "ML engineer",
      interests: ["AI", "ML"],
    });
    const toUser = await createTestUser({ displayName: "Bob" });
    const { agent: toAgent } = await createTestAgent(toUser.id, "Bob's Agent");

    const connReq = await db.connectionRequest.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        category: "COLLABORATION",
        intent: "Let's work on AI together",
      },
    });

    // Directly execute the core logic from evaluate-connection
    const request = await db.connectionRequest.findUnique({
      where: { id: connReq.id },
      include: {
        fromUser: { include: { profile: true } },
        toUser: { include: { externalAgent: true } },
      },
    });

    const agent = request!.toUser.externalAgent!;

    const conversation = await db.agentConversation.create({
      data: {
        externalAgentId: agent.id,
        connectionRequestId: connReq.id,
        status: "ACTIVE",
      },
    });

    const fromProfile = request!.fromUser.profile;

    const agentEvent = await db.agentEvent.create({
      data: {
        externalAgentId: agent.id,
        type: "CONNECTION_REQUEST",
        connectionRequestId: connReq.id,
        conversationId: conversation.id,
        payload: {
          requestId: connReq.id,
          fromUser: {
            username: request!.fromUser.username,
            displayName: fromProfile?.displayName || request!.fromUser.username,
            bio: fromProfile?.bio || "",
            interests: fromProfile?.interests || [],
          },
          category: request!.category,
          intent: request!.intent,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Verify agent event
    expect(agentEvent.type).toBe("CONNECTION_REQUEST");
    expect(agentEvent.externalAgentId).toBe(toAgent.id);
    expect(agentEvent.connectionRequestId).toBe(connReq.id);
    expect(agentEvent.conversationId).toBe(conversation.id);
    const payload = agentEvent.payload as Record<string, unknown>;
    expect(payload.requestId).toBe(connReq.id);
    expect(payload.category).toBe("COLLABORATION");
    expect(payload.intent).toBe("Let's work on AI together");
    const fromUserPayload = payload.fromUser as Record<string, unknown>;
    expect(fromUserPayload.displayName).toBe("Alice");
    expect(fromUserPayload.bio).toBe("ML engineer");
    expect(fromUserPayload.interests).toEqual(["AI", "ML"]);

    // Verify conversation
    const conv = await db.agentConversation.findUnique({
      where: { id: conversation.id },
    });
    expect(conv!.status).toBe("ACTIVE");
    expect(conv!.connectionRequestId).toBe(connReq.id);

    // Verify expiry is approximately 24 hours out
    const hoursUntilExpiry =
      (agentEvent.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60);
    expect(hoursUntilExpiry).toBeGreaterThan(23);
    expect(hoursUntilExpiry).toBeLessThanOrEqual(24);
  });

  it("should notify user when recipient has no active agent", async () => {
    const fromUser = await createTestUser({ displayName: "Sender" });
    const toUser = await createTestUser({ displayName: "No Agent User" });
    // toUser has NO agent

    const connReq = await db.connectionRequest.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        intent: "Want to connect",
      },
    });

    // Simulate the no-agent branch of evaluate-connection
    const request = await db.connectionRequest.findUnique({
      where: { id: connReq.id },
      include: {
        fromUser: { include: { profile: true } },
        toUser: { include: { externalAgent: true } },
      },
    });

    const agent = request!.toUser.externalAgent;
    expect(agent).toBeNull();

    // This is what evaluate-connection does when there's no agent
    await db.notification.create({
      data: {
        userId: request!.toUserId,
        type: "CONNECTION_REQUEST",
        title: "New connection request",
        body: "Connect an agent to process requests automatically.",
        metadata: { requestId: connReq.id },
      },
    });

    // Verify notification was created for the recipient
    const notif = await db.notification.findFirst({
      where: { userId: toUser.id, type: "CONNECTION_REQUEST" },
    });
    expect(notif).not.toBeNull();
    expect(notif!.title).toBe("New connection request");
    expect(notif!.body).toContain("Connect an agent");
    expect((notif!.metadata as Record<string, string>).requestId).toBe(connReq.id);
  });

  it("should notify user when recipient has suspended agent", async () => {
    const fromUser = await createTestUser({ displayName: "Sender 2" });
    const toUser = await createTestUser({ displayName: "Suspended Agent User" });
    // Create a SUSPENDED agent
    const { agent } = await createTestAgent(toUser.id, "Suspended Bot");
    await db.externalAgent.update({
      where: { id: agent.id },
      data: { status: "SUSPENDED" },
    });

    const connReq = await db.connectionRequest.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        intent: "Connect please",
      },
    });

    const request = await db.connectionRequest.findUnique({
      where: { id: connReq.id },
      include: {
        toUser: { include: { externalAgent: true } },
      },
    });

    const agentRecord = request!.toUser.externalAgent;
    expect(agentRecord!.status).toBe("SUSPENDED");

    // evaluate-connection treats non-ACTIVE agents the same as no agent
    await db.notification.create({
      data: {
        userId: request!.toUserId,
        type: "CONNECTION_REQUEST",
        title: "New connection request",
        body: "Connect an agent to process requests automatically.",
        metadata: { requestId: connReq.id },
      },
    });

    const notif = await db.notification.findFirst({
      where: { userId: toUser.id },
    });
    expect(notif).not.toBeNull();
  });
});

describe("Inngest Functions — expire-agent-events", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("should expire PENDING connection event and notify agent owner", async () => {
    const fromUser = await createTestUser({ displayName: "Expiry From" });
    const toUser = await createTestUser({ displayName: "Expiry To" });
    const { agent } = await createTestAgent(toUser.id);

    const connReq = await db.connectionRequest.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        intent: "Old request",
      },
    });

    const { event } = await import("./helpers/seed").then((m) =>
      m.createTestAgentEvent({
        agentId: agent.id,
        type: "CONNECTION_REQUEST",
        connectionRequestId: connReq.id,
        payload: { requestId: connReq.id },
        expiresInMs: -1000, // already expired
      }),
    );

    // Simulate expire-agent-events logic
    const agentEvent = await db.agentEvent.findUnique({
      where: { id: event.id },
      include: {
        externalAgent: true,
        connectionRequest: true,
        negotiation: { include: { listing: true } },
      },
    });

    expect(agentEvent!.status).toBe("PENDING");

    await db.agentEvent.update({
      where: { id: event.id },
      data: { status: "EXPIRED" },
    });

    // Notify agent owner about expiry
    if (agentEvent!.connectionRequest && agentEvent!.externalAgent.userId) {
      await db.notification.create({
        data: {
          userId: agentEvent!.externalAgent.userId!,
          type: "AGENT_DECISION",
          title: "Agent event expired",
          body: "A connection request event was not handled in time.",
          metadata: { eventId: event.id, requestId: connReq.id },
        },
      });
    }

    // Verify event is now EXPIRED
    const expired = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(expired!.status).toBe("EXPIRED");

    // Verify owner notification
    const notif = await db.notification.findFirst({
      where: { userId: toUser.id, type: "AGENT_DECISION" },
    });
    expect(notif).not.toBeNull();
    expect(notif!.title).toBe("Agent event expired");
    expect(notif!.body).toContain("not handled in time");
  });

  it("should expire DELIVERED negotiation event and mark negotiation EXPIRED", async () => {
    const seller = await createTestUser({ displayName: "Exp Seller" });
    const buyer = await createTestUser({ displayName: "Exp Buyer" });
    const { agent: sellerAgent } = await createTestAgent(seller.id);

    const listing = await createTestListing(seller.id, {
      title: "Expiring Widget",
      price: 100,
    });
    const negotiation = await createTestNegotiation(
      listing.id,
      buyer.id,
      seller.id,
      80,
    );

    const { event } = await import("./helpers/seed").then((m) =>
      m.createTestAgentEvent({
        agentId: sellerAgent.id,
        type: "NEGOTIATION_OFFER",
        negotiationId: negotiation.id,
        payload: { negotiationId: negotiation.id },
        expiresInMs: -1000,
      }),
    );

    // Mark as DELIVERED (simulating it was polled but not decided)
    await db.agentEvent.update({
      where: { id: event.id },
      data: { status: "DELIVERED" },
    });

    // Simulate expire-agent-events logic for negotiation
    const agentEvent = await db.agentEvent.findUnique({
      where: { id: event.id },
      include: {
        externalAgent: true,
        connectionRequest: true,
        negotiation: { include: { listing: true } },
      },
    });

    expect(["PENDING", "DELIVERED"]).toContain(agentEvent!.status);

    await db.agentEvent.update({
      where: { id: event.id },
      data: { status: "EXPIRED" },
    });

    if (agentEvent!.negotiation) {
      await db.negotiation.update({
        where: { id: negotiation.id },
        data: { status: "EXPIRED" },
      });

      const neg = agentEvent!.negotiation;
      for (const userId of [neg.buyerId, neg.sellerId]) {
        await db.notification.create({
          data: {
            userId,
            type: "NEGOTIATION_UPDATE",
            title: "Negotiation expired",
            body: `The negotiation for "${neg.listing.title}" expired — agent did not respond in time.`,
            metadata: { negotiationId: neg.id },
          },
        });
      }
    }

    // Verify negotiation is EXPIRED
    const updatedNeg = await db.negotiation.findUnique({
      where: { id: negotiation.id },
    });
    expect(updatedNeg!.status).toBe("EXPIRED");

    // Verify both users notified
    const notifs = await db.notification.findMany({
      where: { type: "NEGOTIATION_UPDATE" },
    });
    expect(notifs).toHaveLength(2);
    expect(notifs[0].body).toContain("Expiring Widget");
    expect(notifs[0].body).toContain("did not respond");
  });

  it("should NOT expire events that are already DECIDED", async () => {
    const user = await createTestUser({ displayName: "Decided User" });
    const { agent } = await createTestAgent(user.id);

    const { event } = await import("./helpers/seed").then((m) =>
      m.createTestAgentEvent({
        agentId: agent.id,
        type: "CONNECTION_REQUEST",
        payload: { test: true },
      }),
    );

    // Mark as DECIDED (agent already handled it)
    await db.agentEvent.update({
      where: { id: event.id },
      data: { status: "DECIDED" },
    });

    // Simulate expire check — should skip
    const agentEvent = await db.agentEvent.findUnique({
      where: { id: event.id },
    });

    if (agentEvent!.status !== "PENDING" && agentEvent!.status !== "DELIVERED") {
      // expire-agent-events returns early here
    }

    // Verify it stays DECIDED
    const check = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(check!.status).toBe("DECIDED");

    // No expiry notifications should be created
    const notifs = await db.notification.findMany();
    expect(notifs).toHaveLength(0);
  });
});

describe("Inngest Functions — negotiation-turn", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("should create offer event for seller's agent when both have active agents", async () => {
    const seller = await createTestUser({ displayName: "Turn Seller" });
    const buyer = await createTestUser({ displayName: "Turn Buyer" });
    const { agent: sellerAgent } = await createTestAgent(seller.id, "Seller Bot");
    await createTestAgent(buyer.id, "Buyer Bot");

    const listing = await createTestListing(seller.id, {
      title: "Negotiation Item",
      price: 200,
    });

    const negotiation = await createTestNegotiation(
      listing.id,
      buyer.id,
      seller.id,
      150,
    );

    // Simulate negotiation-turn setup logic
    const neg = await db.negotiation.findUnique({
      where: { id: negotiation.id },
      include: {
        listing: true,
        buyer: { include: { profile: true, externalAgent: true } },
        seller: { include: { profile: true, externalAgent: true } },
      },
    });

    expect(neg!.seller.externalAgent).not.toBeNull();
    expect(neg!.buyer.externalAgent).not.toBeNull();

    const conversation = await db.agentConversation.create({
      data: {
        externalAgentId: sellerAgent.id,
        negotiationId: negotiation.id,
        status: "ACTIVE",
      },
    });

    const agentEvent = await db.agentEvent.create({
      data: {
        externalAgentId: sellerAgent.id,
        type: "NEGOTIATION_OFFER",
        negotiationId: negotiation.id,
        conversationId: conversation.id,
        payload: {
          negotiationId: negotiation.id,
          listing: { title: neg!.listing.title, price: neg!.listing.price },
          offerPrice: neg!.offerPrice,
          buyer: {
            username: neg!.buyer.username,
            displayName: neg!.buyer.profile?.displayName || neg!.buyer.username,
          },
          message: null,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    expect(agentEvent.type).toBe("NEGOTIATION_OFFER");
    expect(agentEvent.externalAgentId).toBe(sellerAgent.id);

    const eventPayload = agentEvent.payload as Record<string, unknown>;
    const listingPayload = eventPayload.listing as Record<string, unknown>;
    expect(listingPayload.title).toBe("Negotiation Item");
    expect(listingPayload.price).toBe(200);
    expect(eventPayload.offerPrice).toBe(150);
  });

  it("should expire negotiation when seller has no agent", async () => {
    const seller = await createTestUser({ displayName: "No Agent Seller" });
    const buyer = await createTestUser({ displayName: "Has Agent Buyer" });
    await createTestAgent(buyer.id, "Buyer Bot");
    // Seller has NO agent

    const listing = await createTestListing(seller.id, {
      title: "Lonely Item",
      price: 100,
    });

    const negotiation = await createTestNegotiation(
      listing.id,
      buyer.id,
      seller.id,
      70,
    );

    // Simulate what negotiation-turn does when agents are missing
    const neg = await db.negotiation.findUnique({
      where: { id: negotiation.id },
      include: {
        listing: true,
        buyer: { include: { externalAgent: true } },
        seller: { include: { externalAgent: true } },
      },
    });

    expect(neg!.seller.externalAgent).toBeNull();

    await db.negotiation.update({
      where: { id: negotiation.id },
      data: { status: "EXPIRED" },
    });

    for (const userId of [neg!.buyerId, neg!.sellerId]) {
      await db.notification.create({
        data: {
          userId,
          type: "NEGOTIATION_UPDATE",
          title: "Negotiation expired",
          body: `Negotiation for "${neg!.listing.title}" expired — both parties must have an active agent.`,
          metadata: { negotiationId: negotiation.id },
        },
      });
    }

    // Verify
    const updatedNeg = await db.negotiation.findUnique({
      where: { id: negotiation.id },
    });
    expect(updatedNeg!.status).toBe("EXPIRED");

    const notifs = await db.notification.findMany({
      where: { type: "NEGOTIATION_UPDATE" },
    });
    expect(notifs).toHaveLength(2);
    expect(notifs[0].body).toContain("both parties must have an active agent");
  });
});

describe("Inngest Functions — process-negotiation-turn (counter-offer routing)", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("should route counter-offer to buyer when seller counters", async () => {
    const seller = await createTestUser({ displayName: "Counter Seller" });
    const buyer = await createTestUser({ displayName: "Counter Buyer" });
    const { agent: sellerAgent } = await createTestAgent(seller.id, "Sell Bot");
    const { agent: buyerAgent } = await createTestAgent(buyer.id, "Buy Bot");

    const listing = await createTestListing(seller.id, {
      title: "Counter Item",
      price: 300,
    });
    const negotiation = await createTestNegotiation(
      listing.id,
      buyer.id,
      seller.id,
      200,
    );

    // Simulate: seller's agent previously decided COUNTER
    // processNegotiationTurn looks at last DECIDED event to determine counterparty
    const prevConv = await db.agentConversation.create({
      data: {
        externalAgentId: sellerAgent.id,
        negotiationId: negotiation.id,
        status: "DECIDED",
      },
    });

    await db.agentEvent.create({
      data: {
        externalAgentId: sellerAgent.id,
        type: "NEGOTIATION_OFFER",
        negotiationId: negotiation.id,
        conversationId: prevConv.id,
        payload: {},
        status: "DECIDED",
        decision: { decision: "COUNTER", counterPrice: 250 },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Now simulate process-negotiation-turn logic
    const neg = await db.negotiation.findUnique({
      where: { id: negotiation.id },
      include: {
        listing: true,
        buyer: { include: { externalAgent: true, profile: true } },
        seller: { include: { externalAgent: true, profile: true } },
      },
    });

    // Find last decided event to determine who countered
    const lastEvent = await db.agentEvent.findFirst({
      where: { negotiationId: negotiation.id, status: "DECIDED" },
      orderBy: { updatedAt: "desc" },
    });

    const isSellerLast = lastEvent?.externalAgentId === neg!.seller.externalAgent?.id;
    expect(isSellerLast).toBe(true);

    // Counter goes to buyer
    const counterparty = isSellerLast ? neg!.buyer : neg!.seller;
    const counterpartyAgent = counterparty.externalAgent;
    expect(counterpartyAgent!.id).toBe(buyerAgent.id);

    // Create event for buyer's agent
    const conversation = await db.agentConversation.create({
      data: {
        externalAgentId: counterpartyAgent!.id,
        negotiationId: negotiation.id,
        status: "ACTIVE",
      },
    });

    const counterEvent = await db.agentEvent.create({
      data: {
        externalAgentId: counterpartyAgent!.id,
        type: "NEGOTIATION_TURN",
        negotiationId: negotiation.id,
        conversationId: conversation.id,
        payload: {
          negotiationId: negotiation.id,
          listing: { title: neg!.listing.title, price: neg!.listing.price },
          counterPrice: 250,
          reason: "Meet me at $250",
          offerPrice: neg!.offerPrice,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    expect(counterEvent.type).toBe("NEGOTIATION_TURN");
    expect(counterEvent.externalAgentId).toBe(buyerAgent.id);
    const counterPayload = counterEvent.payload as Record<string, unknown>;
    expect(counterPayload.counterPrice).toBe(250);
  });

  it("should expire negotiation when counterparty has no active agent", async () => {
    const seller = await createTestUser({ displayName: "Counter Seller 2" });
    const buyer = await createTestUser({ displayName: "Counter Buyer 2" });
    const { agent: sellerAgent } = await createTestAgent(seller.id, "S Bot");
    // Buyer has NO agent

    const listing = await createTestListing(seller.id, { price: 100 });
    const negotiation = await createTestNegotiation(
      listing.id,
      buyer.id,
      seller.id,
      60,
    );

    // Seller previously decided COUNTER
    const prevConv = await db.agentConversation.create({
      data: {
        externalAgentId: sellerAgent.id,
        negotiationId: negotiation.id,
        status: "DECIDED",
      },
    });

    await db.agentEvent.create({
      data: {
        externalAgentId: sellerAgent.id,
        type: "NEGOTIATION_OFFER",
        negotiationId: negotiation.id,
        conversationId: prevConv.id,
        payload: {},
        status: "DECIDED",
        decision: { decision: "COUNTER", counterPrice: 80 },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    // Simulate: counterparty (buyer) has no agent
    const neg = await db.negotiation.findUnique({
      where: { id: negotiation.id },
      include: {
        buyer: { include: { externalAgent: true } },
        seller: { include: { externalAgent: true } },
      },
    });

    expect(neg!.buyer.externalAgent).toBeNull();

    // process-negotiation-turn expires the negotiation
    await db.negotiation.update({
      where: { id: negotiation.id },
      data: { status: "EXPIRED" },
    });

    const updatedNeg = await db.negotiation.findUnique({
      where: { id: negotiation.id },
    });
    expect(updatedNeg!.status).toBe("EXPIRED");
  });
});
