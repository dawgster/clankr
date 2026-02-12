import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { agentReplySchema } from "@/lib/validators";
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
        conversation: true,
        connectionRequest: { select: { fromUserId: true, toUserId: true } },
        negotiation: { select: { buyerId: true, sellerId: true } },
      },
    });

    if (!event) {
      return NextResponse.json({ error: "Event not found" }, { status: 404 });
    }

    if (event.externalAgentId !== agent.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    if (event.expiresAt < new Date()) {
      return NextResponse.json({ error: "Event expired" }, { status: 410 });
    }

    const body = await req.json();
    const { content } = agentReplySchema.parse(body);

    // NEW_MESSAGE: reply via agent-to-agent chat
    if (event.type === "NEW_MESSAGE") {
      if (!agent.userId) {
        return NextResponse.json({ error: "Agent not claimed" }, { status: 400 });
      }

      const payload = event.payload as { senderUserId?: string; chatThreadId?: string };
      if (!payload.senderUserId) {
        return NextResponse.json({ error: "Invalid event payload" }, { status: 400 });
      }

      // Record the reply in this agent's conversation
      const conversationId = event.conversationId;
      if (conversationId) {
        await db.agentMessage.create({
          data: { conversationId, role: "AGENT", content },
        });
        await db.agentConversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });
      }

      // Mark this event as decided
      await db.agentEvent.update({
        where: { id: eventId },
        data: { status: "DECIDED", decision: { action: "REPLY" } },
      });

      // Send the reply to the other side's agent
      const result = await sendAgentChatMessage(
        { id: agent.id, userId: agent.userId },
        payload.senderUserId,
        content,
      );

      if (result) {
        await inngest.send({
          name: "agent/event.created",
          data: { eventId: result.eventId },
        });
      }

      return NextResponse.json({ ok: true, conversationId });
    }

    // Default: multi-turn conversation reply (CONNECTION_REQUEST, NEGOTIATION, etc.)
    let conversationId = event.conversationId;
    if (!conversationId) {
      const conversation = await db.agentConversation.create({
        data: {
          externalAgentId: agent.id,
          connectionRequestId: event.connectionRequestId,
          negotiationId: event.negotiationId,
          status: "ACTIVE",
        },
      });
      conversationId = conversation.id;

      await db.agentEvent.update({
        where: { id: eventId },
        data: { conversationId },
      });
    }

    await db.agentMessage.create({
      data: {
        conversationId,
        role: "AGENT",
        content,
      },
    });

    // Forward the reply to the other side's agent
    if (agent.userId) {
      let peerUserId: string | null = null;

      if (event.connectionRequest) {
        // If this agent is the recipient (toUser), forward to the requester (fromUser)
        // If this agent is the requester, forward to the recipient
        peerUserId =
          event.connectionRequest.toUserId === agent.userId
            ? event.connectionRequest.fromUserId
            : event.connectionRequest.toUserId;
      } else if (event.negotiation) {
        peerUserId =
          event.negotiation.sellerId === agent.userId
            ? event.negotiation.buyerId
            : event.negotiation.sellerId;
      }

      if (peerUserId) {
        const result = await sendAgentChatMessage(
          { id: agent.id, userId: agent.userId },
          peerUserId,
          content,
        );

        if (result) {
          await inngest.send({
            name: "agent/event.created",
            data: { eventId: result.eventId },
          });
        }
      }
    }

    return NextResponse.json({ ok: true, conversationId });
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
    console.error("Agent reply error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
