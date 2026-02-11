import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getOrCreateThread } from "@/lib/actions/message";
import { EmptyState } from "@/components/chat/empty-state";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ with?: string }>;
}) {
  const { with: withUserId } = await searchParams;

  // If "with" param, redirect to or create thread
  if (withUserId) {
    await requireUser();
    const threadId = await getOrCreateThread(withUserId);
    redirect(`/messages/${threadId}`);
  }

  return <EmptyState />;
}
