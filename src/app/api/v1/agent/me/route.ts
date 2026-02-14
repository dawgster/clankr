import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { HOMESERVER_URL } from "@/lib/matrix/api";

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
        matrixUserId: true,
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

    const matrix =
      agent.matrixUserId && agent.matrixAccessToken
        ? {
            homeserverUrl: HOMESERVER_URL,
            userId: agent.matrixUserId,
            accessToken: agent.matrixAccessToken,
            deviceId: agent.matrixDeviceId,
            ownerMatrixId: user.matrixUserId,
          }
        : null;

    const near = agent.nearAccountId
      ? { accountId: agent.nearAccountId, publicKey: agent.nearPublicKey }
      : null;

    return NextResponse.json({ user, matrix, near });
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
