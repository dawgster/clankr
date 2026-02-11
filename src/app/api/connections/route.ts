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
  const type = url.searchParams.get("type");

  if (type === "requests") {
    const [sent, received] = await Promise.all([
      db.connectionRequest.findMany({
        where: { fromUserId: user.id },
        include: { toUser: { include: { profile: true } } },
        orderBy: { createdAt: "desc" },
      }),
      db.connectionRequest.findMany({
        where: { toUserId: user.id },
        include: {
          fromUser: { include: { profile: true } },
          conversations: {
            include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
          },
        },
        orderBy: { createdAt: "desc" },
      }),
    ]);
    return NextResponse.json({ sent, received });
  }

  const connections = await db.connection.findMany({
    where: {
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    include: {
      userA: { include: { profile: true } },
      userB: { include: { profile: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(connections);
}
