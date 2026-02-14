import { NextRequest, NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendMessage, sync } from "@/lib/matrix/api";
import type { MatrixMessage } from "@/lib/matrix/api";

export async function GET(req: NextRequest) {
  try {
    const user = await requireUser();

    const dbUser = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { matrixAccessToken: true, matrixUserId: true },
    });

    if (!dbUser.matrixAccessToken) {
      return NextResponse.json(
        { error: "No Matrix account provisioned" },
        { status: 400 },
      );
    }

    const roomId = req.nextUrl.searchParams.get("roomId");
    if (!roomId) {
      return NextResponse.json(
        { error: "roomId is required" },
        { status: 400 },
      );
    }

    const since = req.nextUrl.searchParams.get("since") || undefined;

    const syncResponse = await sync(dbUser.matrixAccessToken, since, 0);

    const roomData = syncResponse.rooms?.join?.[roomId];
    const events = roomData?.timeline?.events || [];

    const messages = events
      .filter(
        (e: MatrixMessage) =>
          e.type === "m.room.message" && e.content.msgtype === "m.text",
      )
      .map((e: MatrixMessage) => ({
        eventId: e.event_id,
        sender: e.sender,
        content: e.content.body,
        timestamp: e.origin_server_ts,
        isOwn: e.sender === dbUser.matrixUserId,
      }));

    return NextResponse.json({
      messages,
      nextBatch: syncResponse.next_batch,
    });
  } catch (err) {
    console.error("Matrix messages fetch error:", err);
    return NextResponse.json(
      { error: "Failed to fetch messages" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireUser();

    const dbUser = await db.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { matrixAccessToken: true },
    });

    if (!dbUser.matrixAccessToken) {
      return NextResponse.json(
        { error: "No Matrix account provisioned" },
        { status: 400 },
      );
    }

    const body = await req.json();
    const { roomId, content } = body;

    if (!roomId || !content) {
      return NextResponse.json(
        { error: "roomId and content are required" },
        { status: 400 },
      );
    }

    const result = await sendMessage(
      dbUser.matrixAccessToken,
      roomId,
      content,
    );

    return NextResponse.json({ eventId: result.event_id });
  } catch (err) {
    console.error("Matrix message send error:", err);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}
