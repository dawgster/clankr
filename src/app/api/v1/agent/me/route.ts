import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";

export async function GET(req: NextRequest) {
  try {
    const agent = await authenticateAgent(req);

    if (!agent.userId) {
      return NextResponse.json(
        { error: "Agent must be claimed to access user profile" },
        { status: 403 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: agent.userId },
      select: {
        id: true,
        username: true,
        profile: {
          select: {
            displayName: true,
            bio: true,
            intent: true,
            interests: true,
            lookingFor: true,
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ user });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    console.error("Agent me error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
