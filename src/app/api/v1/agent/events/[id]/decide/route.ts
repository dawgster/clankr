import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { agentDecideSchema } from "@/lib/validators";
import { inngest } from "@/inngest/client";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await authenticateAgent(req);
    const { id: eventId } = await params;

    const event = await db.agentEvent.findUnique({
      where: { id: eventId },
      include: {
        connectionRequest: true,
        negotiation: { include: { listing: true } },
        conversation: true,
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (event.externalAgentId !== agent.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (event.status === "DECIDED") {
      return NextResponse.json(
        { error: "Event already decided" },
        { status: 409 },
      );
    }

    if (event.status === "EXPIRED" || event.expiresAt < new Date()) {
      return NextResponse.json({ error: "Event expired" }, { status: 410 });
    }

    const body = await req.json();
    const decisionData = agentDecideSchema.parse(body);

    // Update event
    await db.agentEvent.update({
      where: { id: eventId },
      data: { status: "DECIDED", decision: decisionData },
    });

    // Process based on event type
    if (
      event.type === "CONNECTION_REQUEST" &&
      event.connectionRequest
    ) {
      await processConnectionDecision(event.connectionRequestId!, decisionData, agent.id);
    } else if (
      (event.type === "NEGOTIATION_OFFER" ||
        event.type === "NEGOTIATION_TURN") &&
      event.negotiation
    ) {
      await processNegotiationDecision(
        event.negotiationId!,
        decisionData,
        agent.id,
        event.negotiation.listing,
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("Agent decide error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}

async function processConnectionDecision(
  requestId: string,
  decision: { decision: string; confidence?: number; reason?: string },
  agentId: string,
) {
  const request = await db.connectionRequest.findUnique({
    where: { id: requestId },
  });
  if (!request) return;

  if (decision.decision === "ACCEPT") {
    await db.connectionRequest.update({
      where: { id: requestId },
      data: { status: "ACCEPTED" },
    });
    await db.connection.create({
      data: { userAId: request.fromUserId, userBId: request.toUserId },
    });
    const thread = await db.messageThread.create({ data: {} });
    await db.messageThreadParticipant.createMany({
      data: [
        { threadId: thread.id, userId: request.fromUserId },
        { threadId: thread.id, userId: request.toUserId },
      ],
    });
    await db.notification.create({
      data: {
        userId: request.fromUserId,
        type: "CONNECTION_ACCEPTED",
        title: "Connection accepted!",
        body: decision.reason || "Your connection request was accepted.",
        metadata: { requestId },
      },
    });
    await db.notification.create({
      data: {
        userId: request.toUserId,
        type: "AGENT_DECISION",
        title: "Agent accepted a connection request",
        body: decision.reason || "Connection accepted.",
        metadata: { requestId },
      },
    });
  } else if (decision.decision === "REJECT") {
    await db.connectionRequest.update({
      where: { id: requestId },
      data: { status: "REJECTED" },
    });
    await db.notification.create({
      data: {
        userId: request.fromUserId,
        type: "CONNECTION_REJECTED",
        title: "Connection declined",
        body: decision.reason || "The user's agent declined your request.",
        metadata: { requestId },
      },
    });
    await db.notification.create({
      data: {
        userId: request.toUserId,
        type: "AGENT_DECISION",
        title: "Agent rejected a connection request",
        body: decision.reason || "Connection rejected.",
        metadata: { requestId },
      },
    });
  } else if (decision.decision === "ASK_MORE") {
    await db.connectionRequest.update({
      where: { id: requestId },
      data: { status: "IN_CONVERSATION" },
    });

    // Create conversation + message if reason provided
    if (decision.reason) {
      const conversation = await db.agentConversation.create({
        data: {
          externalAgentId: agentId,
          connectionRequestId: requestId,
          status: "ACTIVE",
        },
      });
      await db.agentMessage.create({
        data: {
          conversationId: conversation.id,
          role: "AGENT",
          content: decision.reason,
        },
      });
    }

    await db.notification.create({
      data: {
        userId: request.fromUserId,
        type: "AGENT_DECISION",
        title: "Agent wants to know more",
        body:
          decision.reason ||
          "The agent has some questions before making a decision.",
        metadata: { requestId },
      },
    });
  }
}

async function processNegotiationDecision(
  negotiationId: string,
  decision: {
    decision: string;
    confidence?: number;
    reason?: string;
    counterPrice?: number;
  },
  _agentId: string,
  listing: { id: string; title: string; price: number },
) {
  const negotiation = await db.negotiation.findUnique({
    where: { id: negotiationId },
    include: { buyer: true, seller: true },
  });
  if (!negotiation) return;

  if (decision.decision === "ACCEPT") {
    await db.negotiation.update({
      where: { id: negotiationId },
      data: { status: "ACCEPTED" },
    });
    await db.listing.update({
      where: { id: listing.id },
      data: { status: "SOLD" },
    });
    for (const userId of [negotiation.buyerId, negotiation.sellerId]) {
      await db.notification.create({
        data: {
          userId,
          type: "NEGOTIATION_UPDATE",
          title: "Negotiation accepted",
          body: `The negotiation for "${listing.title}" has been accepted.`,
          metadata: { negotiationId },
        },
      });
    }
  } else if (decision.decision === "REJECT") {
    await db.negotiation.update({
      where: { id: negotiationId },
      data: { status: "REJECTED" },
    });
    for (const userId of [negotiation.buyerId, negotiation.sellerId]) {
      await db.notification.create({
        data: {
          userId,
          type: "NEGOTIATION_UPDATE",
          title: "Negotiation rejected",
          body: `The negotiation for "${listing.title}" has been rejected.`,
          metadata: { negotiationId },
        },
      });
    }
  } else if (decision.decision === "COUNTER" && decision.counterPrice) {
    // Fire event for the counterparty's agent
    await inngest.send({
      name: "agent/negotiation.turn",
      data: {
        negotiationId,
        counterPrice: decision.counterPrice,
        reason: decision.reason,
      },
    });
  }
}
