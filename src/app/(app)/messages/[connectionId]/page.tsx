import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { MatrixThread } from "@/components/messages/matrix-thread";

export default async function ConnectionPage({
  params,
}: {
  params: Promise<{ connectionId: string }>;
}) {
  const { connectionId } = await params;
  const user = await requireUser();

  const connection = await db.connection.findUnique({
    where: { id: connectionId },
    include: {
      userA: { include: { profile: true } },
      userB: { include: { profile: true } },
    },
  });

  if (!connection) notFound();

  // Verify user is part of this connection
  if (connection.userAId !== user.id && connection.userBId !== user.id) {
    notFound();
  }

  const otherUser =
    connection.userAId === user.id ? connection.userB : connection.userA;

  return (
    <MatrixThread
      connectionId={connectionId}
      otherUser={{
        username: otherUser.username,
        profile: otherUser.profile,
      }}
    />
  );
}
