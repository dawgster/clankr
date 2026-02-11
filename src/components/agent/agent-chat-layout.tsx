"use client";

import { usePathname } from "next/navigation";
import { ChatListHeader } from "@/components/chat/chat-list-header";
import { AgentConversationList } from "./agent-conversation-list";
import { cn } from "@/lib/utils";

interface ConversationItem {
  id: string;
  status: string;
  decision: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  connectionRequest: {
    id: string;
    intent: string;
    category: string;
    status: string;
    fromUser: {
      username: string;
      profile: { displayName: string | null; avatarUrl: string | null } | null;
    };
  } | null;
  negotiation: {
    id: string;
    offerPrice: number;
    status: string;
    listing: { title: string };
    buyer: {
      username: string;
      profile: { displayName: string | null; avatarUrl: string | null } | null;
    };
    seller: {
      username: string;
      profile: { displayName: string | null; avatarUrl: string | null } | null;
    };
  } | null;
  messages: { content: string; createdAt: Date | string }[];
  _count: { messages: number };
}

interface AgentChatLayoutProps {
  conversations: ConversationItem[];
  children: React.ReactNode;
}

export function AgentChatLayout({
  conversations,
  children,
}: AgentChatLayoutProps) {
  const pathname = usePathname();
  const isInConversation = pathname !== "/agent-chats";
  const activeConversationId = isInConversation
    ? pathname.split("/").pop()
    : undefined;

  return (
    <div className="flex h-screen">
      {/* Left panel — conversation list */}
      <div
        className={cn(
          "flex h-full w-full flex-col border-r md:w-[350px] md:shrink-0",
          isInConversation && "hidden md:flex",
        )}
      >
        <ChatListHeader />
        <AgentConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
        />
      </div>

      {/* Right panel — conversation detail or empty state */}
      <div
        className={cn(
          "flex h-full min-w-0 flex-1 flex-col",
          !isInConversation && "hidden md:flex",
        )}
      >
        {children}
      </div>
    </div>
  );
}
