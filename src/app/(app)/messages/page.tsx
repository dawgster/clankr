import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { EmptyState } from "@/components/chat/empty-state";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string }>;
}) {
  const { with: withUserId } = await searchParams;

  if (withUserId) {
    const user = await requireUser();

    const connection = await db.connection.findFirst({
      where: {
        OR: [
          { userAId: user.id, userBId: withUserId },
          { userAId: withUserId, userBId: user.id },
        ],
      },
    });

    if (!connection) {
      redirect("/connections");
    }

    redirect(`/messages/${connection.id}`);
  }

  return <EmptyState />;
}
