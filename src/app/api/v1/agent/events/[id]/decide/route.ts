import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { agentDecideSchema } from "@/lib/validators";
import { ensureConnectionMatrixRoom } from "@/lib/matrix/user-dm";
import { sendAgentChatMessage } from "@/lib/agent-chat";
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
      await processConnectionDecision(
        event.connectionRequestId!,
        decisionData,
        { id: agent.id, userId: agent.userId },
      );
    }
    // NEW_MESSAGE: ACCEPT = acknowledge, no further processing needed

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
  agent: { id: string; userId: string | null },
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
    const connection = await db.connection.create({
      data: { userAId: request.fromUserId, userBId: request.toUserId },
    });
    try {
      await ensureConnectionMatrixRoom(connection.id);
    } catch (err) {
      console.error("Failed to create Matrix room on ACCEPT (will be created lazily):", err);
    }
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

    // Forward the question to the other agent so they can poll for it.
    // sendAgentChatMessage records the message on both sides.
    if (decision.reason && agent.userId) {
      const peerUserId =
        request.toUserId === agent.userId
          ? request.fromUserId
          : request.toUserId;

      const result = await sendAgentChatMessage(
        { id: agent.id, userId: agent.userId },
        peerUserId,
        decision.reason,
      );

      if (result) {
        await inngest.send({
          name: "agent/event.created",
          data: { eventId: result.eventId },
        });
      }
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
