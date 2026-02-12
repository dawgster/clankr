"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Bot } from "lucide-react";
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

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  DECIDED: "bg-blue-100 text-blue-800",
  EXPIRED: "bg-gray-100 text-gray-800",
};

function conversationLabel(conv: ConversationItem): string {
  if (conv.connectionRequest) {
    const name =
      conv.connectionRequest.fromUser.profile?.displayName ||
      conv.connectionRequest.fromUser.username;
    return `${name}'s Clankr`;
  }
  if (conv.negotiation) {
    const name =
      conv.negotiation.buyer.profile?.displayName ||
      conv.negotiation.buyer.username;
    return `${name}'s Clankr`;
  }
  return "Agent Conversation";
}

function conversationAvatar(conv: ConversationItem): {
  url: string | null;
  fallback: string;
} {
  if (conv.connectionRequest) {
    return {
      url: conv.connectionRequest.fromUser.profile?.avatarUrl || null,
      fallback:
        (
          conv.connectionRequest.fromUser.profile?.displayName ||
          conv.connectionRequest.fromUser.username
        )
          ?.slice(0, 2)
          .toUpperCase() || "??",
    };
  }
  if (conv.negotiation) {
    return {
      url: conv.negotiation.buyer.profile?.avatarUrl || null,
      fallback:
        (
          conv.negotiation.buyer.profile?.displayName ||
          conv.negotiation.buyer.username
        )
          ?.slice(0, 2)
          .toUpperCase() || "??",
    };
  }
  return { url: null, fallback: "AG" };
}

function conversationPreview(conv: ConversationItem): string {
  if (conv.messages.length > 0) {
    return conv.messages[0].content;
  }
  if (conv.connectionRequest) {
    return conv.connectionRequest.intent;
  }
  if (conv.negotiation) {
    return `$${conv.negotiation.offerPrice}`;
  }
  return "No messages yet";
}

interface AgentConversationListProps {
  conversations: ConversationItem[];
  activeConversationId?: string;
}

export function AgentConversationList({
  conversations,
  activeConversationId,
}: AgentConversationListProps) {
  if (conversations.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        <div className="flex flex-col items-center gap-2">
          <Bot className="h-8 w-8" />
          <p>No agent conversations yet.</p>
          <p className="text-xs">
            Conversations will appear here when your agent handles requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {conversations.map((conv) => {
        const isActive = conv.id === activeConversationId;
        const avatar = conversationAvatar(conv);
        const preview = conversationPreview(conv);

        return (
          <Link
            key={conv.id}
            href={`/agent-chats/${conv.id}`}
            className={cn(
              "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50",
              isActive && "bg-accent",
            )}
          >
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={avatar.url || undefined} />
              <AvatarFallback>{avatar.fallback}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">
                  {conversationLabel(conv)}
                </p>
                <Badge
                  variant="outline"
                  className={`shrink-0 text-[10px] ${statusColors[conv.status] || ""}`}
                >
                  {conv.status}
                </Badge>
              </div>
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-xs text-muted-foreground">
                  {preview}
                </p>
                <span className="shrink-0 text-[10px] text-muted-foreground">
                  {new Date(conv.updatedAt).toLocaleDateString()}
                </span>
              </div>
              {conv._count.messages > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  {conv._count.messages} message
                  {conv._count.messages !== 1 ? "s" : ""}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
