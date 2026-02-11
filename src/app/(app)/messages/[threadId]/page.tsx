import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MessageThread } from "@/components/messages/thread";

export default async function ThreadPage({
  params,
}: {
  params: Promise<{ threadId: string }>;
}) {
  const { threadId } = await params;
  const user = await requireUser();

  // Verify participation
  const participant = await db.messageThreadParticipant.findUnique({
    where: { threadId_userId: { threadId, userId: user.id } },
  });
  if (!participant) notFound();

  const thread = await db.messageThread.findUnique({
    where: { id: threadId },
    include: {
      participants: {
        include: { user: { include: { profile: true } } },
      },
      messages: {
        include: { sender: { include: { profile: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!thread) notFound();

  const otherParticipant = thread.participants.find(
    (p) => p.userId !== user.id,
  );

  return (
    <MessageThread
      threadId={threadId}
      currentUserId={user.id}
      otherUser={otherParticipant?.user || null}
      initialMessages={thread.messages}
    />
  );
}
