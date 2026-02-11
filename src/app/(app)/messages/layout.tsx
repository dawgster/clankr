import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { ChatLayout } from "@/components/chat/chat-layout";

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  const participations = await db.messageThreadParticipant.findMany({
    where: { userId: user.id },
    include: {
      thread: {
        include: {
          participants: {
            include: { user: { include: { profile: true } } },
          },
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
    },
    orderBy: { thread: { updatedAt: "desc" } },
  });

  const threads = participations.map((p) => p.thread);

  return (
    <ChatLayout threads={threads} currentUserId={user.id}>
      {children}
    </ChatLayout>
  );
}
