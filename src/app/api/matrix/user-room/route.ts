import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ensureConnectionMatrixRoom } from "@/lib/matrix/user-dm";

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    const { connectionId } = body;

    if (!connectionId) {
      return NextResponse.json(
        { error: "connectionId is required" },
        { status: 400 },
      );
    }

    const connection = await db.connection.findUnique({
      where: { id: connectionId },
    });

    if (!connection) {
      return NextResponse.json(
        { error: "Connection not found" },
        { status: 404 },
      );
    }

    // Verify user is part of this connection
    if (connection.userAId !== user.id && connection.userBId !== user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const roomId = await ensureConnectionMatrixRoom(connectionId);

    const dbUser = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { matrixUserId: true },
    });

    return NextResponse.json({
      roomId,
      matrixUserId: dbUser.matrixUserId,
    });
  } catch (err) {
    console.error("User room creation error:", err);
    return NextResponse.json(
      { error: "Failed to create user DM room" },
      { status: 500 },
    );
  }
}
