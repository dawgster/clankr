import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MatrixChatLayout } from "@/components/chat/matrix-chat-layout";

export default async function MessagesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

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

  const mapped = connections.map((c) => {
    const otherUser = c.userAId === user.id ? c.userB : c.userA;
    return {
      id: c.id,
      createdAt: c.createdAt,
      otherUser: {
        id: otherUser.id,
        username: otherUser.username,
        profile: otherUser.profile,
      },
    };
  });

  return (
    <MatrixChatLayout connections={mapped}>
      {children}
    </MatrixChatLayout>
  );
}
