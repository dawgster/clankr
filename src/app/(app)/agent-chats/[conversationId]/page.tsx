import { notFound } from "next/navigation";
import { getAgentConversation } from "@/lib/actions/agent";
import { AgentConversationThread } from "@/components/agent/agent-conversation-thread";

export default async function AgentConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  const conversation = await getAgentConversation(conversationId);

  if (!conversation) notFound();

  return <AgentConversationThread conversation={conversation} />;
}
