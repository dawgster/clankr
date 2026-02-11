import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerkId } });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  const after = url.searchParams.get("after");

  if (!threadId) {
    return NextResponse.json({ error: "Missing threadId" }, { status: 400 });
  }

  // Verify participation
  const participant = await db.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: user.id } },
  });
  if (!participant) {
    return NextResponse.json({ error: "Not a participant" }, { status: 403 });
  }

  const messages = await db.directMessage.findMany({
    where: {
      threadId,
      ...(after
        ? { createdAt: { gt: (await db.directMessage.findUnique({ where: { id: after } }))?.createdAt || new Date() } }
        : {}),
    },
    include: { sender: { include: { profile: true } } },
    orderBy: { createdAt: "asc" },
    take: 50,
  });

  return NextResponse.json(messages);
}
