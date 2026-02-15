import { notFound } from "next/navigation";
import { getAgentConversation } from "@/lib/actions/agent";
import { requireUser } from "@/lib/auth";
import { AgentConversationThread } from "@/components/agent/agent-conversation-thread";

export default async function AgentConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const [conversation, user] = await Promise.all([
    getAgentConversation(conversationId),
    requireUser(),
  ]);

  if (!conversation) notFound();

  return (
    <AgentConversationThread
      conversation={conversation}
      currentUserAvatarUrl={user.profile?.avatarUrl ?? null}
    />
  );
}
