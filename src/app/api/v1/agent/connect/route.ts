import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { agentConnectSchema } from "@/lib/validators";
import { inngest } from "@/inngest/client";
import { ensureAgentEventForRequest } from "@/lib/connection-events";
import {
  validateStakeAgainstPolicy,
  createStakeTransaction,
} from "@/lib/payment";

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
    const data = agentConnectSchema.parse(body);

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

    // Validate stake against target user's payment policy
    const policyError = await validateStakeAgainstPolicy(
      data.toUserId,
      data.stakeNear,
    );
    if (policyError) {
      return NextResponse.json({ error: policyError }, { status: 422 });
    }

    const request = await db.connectionRequest.create({
      data: {
        fromUserId: agent.userId,
        toUserId: data.toUserId,
        category: data.category,
        intent: data.intent,
        stakeNear: data.stakeNear ?? null,
      },
    });

    // Create payment transaction if a stake was provided
    if (data.stakeNear && data.stakeNear > 0) {
      const senderProfile = await db.profile.findUnique({
        where: { userId: agent.userId },
        select: { nearAccountId: true },
      });
      const recipientProfile = await db.profile.findUnique({
        where: { userId: data.toUserId },
        select: { nearAccountId: true },
      });

      if (senderProfile?.nearAccountId && recipientProfile?.nearAccountId) {
        await createStakeTransaction(
          request.id,
          senderProfile.nearAccountId,
          recipientProfile.nearAccountId,
          data.stakeNear,
        );
      }
    }

    // Create agent event synchronously so the target user's agent can
    // see the request immediately (instead of waiting for Inngest).
    const result = await ensureAgentEventForRequest(request.id);

    // Fire Inngest events: the connection/request.created event acts as
    // a fallback (evaluate-connection is idempotent), and agent/event.created
    // triggers webhook delivery if the target has webhooks enabled.
    await inngest.send({
      name: "connection/request.created",
      data: { requestId: request.id },
    });

    if (result.type === "event_created") {
      await inngest.send({
        name: "agent/event.created",
        data: { eventId: result.eventId },
      });
    }

    return NextResponse.json({
      ok: true,
      requestId: request.id,
      stakeNear: data.stakeNear ?? null,
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
    console.error("Agent connect error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
