import { requireUser } from "@/lib/auth";
import { getAgentConversations } from "@/lib/actions/agent";
import { AgentChatLayout } from "@/components/agent/agent-chat-layout";

export default async function AgentChatsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  await requireUser();
  const conversations = await getAgentConversations();

  return (
    <AgentChatLayout conversations={conversations}>
      {children}
    </AgentChatLayout>
  );
}
