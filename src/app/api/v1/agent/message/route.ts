import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { sendAgentChatMessage } from "@/lib/agent-chat";
import { inngest } from "@/inngest/client";
import { z } from "zod";

const agentMessageSchema = z.object({
  userId: z.string().min(1),
  content: z.string().min(1).max(5000),
});

export async function POST(req: NextRequest) {
  try {
    const agent = await authenticateAgent(req);

    if (!agent.userId) {
      return NextResponse.json(
        { error: "Agent must be claimed to send messages" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { userId: targetUserId, content } = agentMessageSchema.parse(body);

    if (targetUserId === agent.userId) {
      return NextResponse.json(
        { error: "Cannot message yourself" },
        { status: 400 },
      );
    }

    // Verify connection exists between agent's user and target
    const connection = await db.connection.findFirst({
      where: {
        OR: [
          { userAId: agent.userId, userBId: targetUserId },
          { userAId: targetUserId, userBId: agent.userId },
        ],
      },
    });

    if (!connection) {
      return NextResponse.json(
        { error: "Not connected with this user" },
        { status: 403 },
      );
    }

    const result = await sendAgentChatMessage(
      { id: agent.id, userId: agent.userId },
      targetUserId,
      content,
    );

    if (!result) {
      return NextResponse.json(
        { error: "Target user has no active agent" },
        { status: 422 },
      );
    }

    // Trigger webhook delivery if target agent has webhooks enabled
    await inngest.send({
      name: "agent/event.created",
      data: { eventId: result.eventId },
    });

    return NextResponse.json({
      ok: true,
      eventId: result.eventId,
      chatThreadId: result.chatThreadId,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
    console.error("Agent message error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
