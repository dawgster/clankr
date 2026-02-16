import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
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

      // Mark this event as decided (sendAgentChatMessage records the message)
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

      return NextResponse.json({ ok: true, conversationId: event.conversationId });
    }

    // Default: multi-turn conversation reply (CONNECTION_REQUEST, etc.)
    let conversationId = event.conversationId;
    if (!conversationId) {
      const conversation = await db.agentConversation.create({
        data: {
          externalAgentId: agent.id,
          connectionRequestId: event.connectionRequestId,
          status: "ACTIVE",
        },
      });
      conversationId = conversation.id;

      await db.agentEvent.update({
        where: { id: eventId },
        data: { conversationId },
      });
    }

    // Forward the reply to the other side's agent via the chat thread.
    // sendAgentChatMessage records the message on both sides, so we don't
    // record it manually here — that would create duplicates.
    if (agent.userId) {
      let peerUserId: string | null = null;

      if (event.connectionRequest) {
        peerUserId =
          event.connectionRequest.toUserId === agent.userId
            ? event.connectionRequest.fromUserId
            : event.connectionRequest.toUserId;
      }

      if (peerUserId) {
        // Upgrade the CONNECTION_REQUEST conversation to a chat thread so
        // sendAgentChatMessage finds and reuses it instead of creating a
        // separate conversation.
        const conv = await db.agentConversation.findUnique({
          where: { id: conversationId },
          select: { chatThreadId: true },
        });
        if (conv && !conv.chatThreadId) {
          await db.agentConversation.update({
            where: { id: conversationId },
            data: {
              chatThreadId: crypto.randomUUID(),
              peerUserId,
            },
          });
        }

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
        } else {
          // Peer has no agent — record the message locally so it's not lost
          await db.agentMessage.create({
            data: { conversationId, role: "AGENT", content },
          });
        }
      } else {
        // No peer to forward to — record the message locally
        await db.agentMessage.create({
          data: { conversationId, role: "AGENT", content },
        });
      }
    } else {
      // Agent not claimed — record the message locally
      await db.agentMessage.create({
        data: { conversationId, role: "AGENT", content },
      });
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
