import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { agentReplySchema } from "@/lib/validators";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const agent = await authenticateAgent(req);
    const { id: eventId } = await params;

    const event = await db.agentEvent.findUnique({
      where: { id: eventId },
      include: { conversation: true },
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

    // Create or use existing conversation
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
