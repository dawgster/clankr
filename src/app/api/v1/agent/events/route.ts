import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";

export async function GET(req: NextRequest) {
  try {
    const agent = await authenticateAgent(req);

    const events = await db.agentEvent.findMany({
      where: {
        externalAgentId: agent.id,
        status: { in: ["PENDING", "DELIVERED"] },
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: "asc" },
      include: {
        connectionRequest: {
          select: {
            id: true,
            category: true,
            intent: true,
            status: true,
            fromUser: {
              select: {
                username: true,
                profile: {
                  select: {
                    displayName: true,
                    bio: true,
                    interests: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    // Mark PENDING events as DELIVERED
    const pendingIds = events
      .filter((e) => e.status === "PENDING")
      .map((e) => e.id);

    if (pendingIds.length > 0) {
      await db.agentEvent.updateMany({
        where: { id: { in: pendingIds } },
        data: { status: "DELIVERED" },
      });
    }

    return NextResponse.json({ events });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    console.error("Agent events error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
