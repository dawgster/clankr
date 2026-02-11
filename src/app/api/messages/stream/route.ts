import { NextRequest } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { userId: clerkId } = await auth();
  if (!clerkId) {
    return new Response("Unauthorized", { status: 401 });
  }

  const user = await db.user.findUnique({ where: { clerkId } });
  if (!user) {
    return new Response("User not found", { status: 404 });
  }

  const url = new URL(req.url);
  const threadId = url.searchParams.get("threadId");
  if (!threadId) {
    return new Response("Missing threadId", { status: 400 });
  }

  // Verify participation
  const participant = await db.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: user.id } },
  });
  if (!participant) {
    return new Response("Not a participant", { status: 403 });
  }

  const encoder = new TextEncoder();
  let lastMessageId: string | null = null;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (data: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(data)}\n\n`),
        );
      };

      const poll = async () => {
        try {
          const messages = await db.directMessage.findMany({
            where: {
              threadId,
              ...(lastMessageId ? { id: { gt: lastMessageId } } : {}),
            },
            include: { sender: { include: { profile: true } } },
            orderBy: { createdAt: "asc" },
            take: 50,
          });

          if (messages.length > 0) {
            lastMessageId = messages[messages.length - 1].id;
            send({ type: "messages", data: messages });
          }
        } catch {
          controller.close();
          return;
        }

        setTimeout(poll, 2000);
      };

      // Send initial keepalive
      send({ type: "connected" });
      poll();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
