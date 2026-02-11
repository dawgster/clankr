import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { connectionRequestSchema } from "@/lib/validators";
import { inngest } from "@/inngest/client";

export async function POST(req: NextRequest) {
  try {
    const agent = await authenticateAgent(req);

    if (!agent.userId) {
      return NextResponse.json(
        { error: "Agent must be claimed to send connection requests" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const data = connectionRequestSchema.parse(body);

    // No self-connect
    if (data.toUserId === agent.userId) {
      return NextResponse.json(
        { error: "Cannot connect with yourself" },
        { status: 400 },
      );
    }

    // Check target user exists
    const targetUser = await db.user.findUnique({
      where: { id: data.toUserId },
    });
    if (!targetUser) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 },
      );
    }

    // Check if already connected
    const existing = await db.connection.findFirst({
      where: {
        OR: [
          { userAId: agent.userId, userBId: data.toUserId },
          { userAId: data.toUserId, userBId: agent.userId },
        ],
      },
    });
    if (existing) {
      return NextResponse.json(
        { error: "Already connected" },
        { status: 409 },
      );
    }

    // Check for existing pending request
    const existingRequest = await db.connectionRequest.findUnique({
      where: {
        fromUserId_toUserId: {
          fromUserId: agent.userId,
          toUserId: data.toUserId,
        },
      },
    });
    if (existingRequest) {
      return NextResponse.json(
        { error: "Request already sent" },
        { status: 409 },
      );
    }

    const request = await db.connectionRequest.create({
      data: {
        fromUserId: agent.userId,
        toUserId: data.toUserId,
        category: data.category,
        intent: data.intent,
      },
    });

    await inngest.send({
      name: "connection/request.created",
      data: { requestId: request.id },
    });

    return NextResponse.json({ ok: true, requestId: request.id });
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
    console.error("Agent connect error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
