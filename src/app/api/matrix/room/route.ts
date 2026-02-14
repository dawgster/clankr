import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureUserMatrixAccount } from "@/lib/matrix/provisioning";
import { createDirectRoom, joinRoom } from "@/lib/matrix/api";

export async function POST() {
  try {
    const user = await requireUser();

    const agent = await db.externalAgent.findUnique({
      where: { userId: user.id },
    });

    if (!agent) {
      return NextResponse.json(
        { error: "No agent connected to your account" },
        { status: 404 },
      );
    }

    if (!agent.matrixUserId || !agent.matrixAccessToken) {
      return NextResponse.json(
        { error: "Agent does not have a Matrix account yet" },
        { status: 400 },
      );
    }

    // Ensure user has a Matrix account
    const updatedUser = await ensureUserMatrixAccount(user);

    if (!updatedUser.matrixAccessToken || !updatedUser.matrixUserId) {
      return NextResponse.json(
        { error: "Failed to provision Matrix account" },
        { status: 500 },
      );
    }

    // Create DM room (user invites agent)
    const room = await createDirectRoom(
      updatedUser.matrixAccessToken,
      agent.matrixUserId,
    );

    // Auto-join as the agent
    await joinRoom(agent.matrixAccessToken, room.room_id);

    return NextResponse.json({
      roomId: room.room_id,
      matrixUserId: updatedUser.matrixUserId,
    });
  } catch (err) {
    console.error("Matrix room creation error:", err);
    return NextResponse.json(
      { error: "Failed to create Matrix room" },
      { status: 500 },
    );
  }
}
