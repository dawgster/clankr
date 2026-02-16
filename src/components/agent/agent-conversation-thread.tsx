"use client";

import { useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ArrowLeft, Bot, User } from "lucide-react";
import Link from "next/link";

interface AgentMessageItem {
  id: string;
  role: string;
  content: string;
  tokenCount: number | null;
  createdAt: Date | string;
}

interface ConversationDetail {
  id: string;
  status: string;
  decision: string | null;
  confidence: number | null;
  reason: string | null;
  chatThreadId: string | null;
  createdAt: Date | string;
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
  peerUser: {
    id: string;
    username: string;
    profile: { displayName: string | null; avatarUrl: string | null } | null;
  } | null;
  messages: AgentMessageItem[];
}

const statusColors: Record<string, string> = {
  ACTIVE: "bg-green-100 text-green-800",
  DECIDED: "bg-blue-100 text-blue-800",
  EXPIRED: "bg-gray-100 text-gray-800",
};

const roleIcons: Record<string, React.ReactNode> = {
  AGENT: <Bot className="h-3.5 w-3.5" />,
  USER: <User className="h-3.5 w-3.5" />,
  SYSTEM: <Bot className="h-3.5 w-3.5" />,
};

const roleBg: Record<string, string> = {
  AGENT: "bg-primary text-primary-foreground",
  USER: "bg-muted",
  SYSTEM: "bg-yellow-50 border border-yellow-200",
};

function conversationTitle(conv: ConversationDetail): string {
  if (conv.connectionRequest) {
    const name =
      conv.connectionRequest.fromUser.profile?.displayName ||
      conv.connectionRequest.fromUser.username;
    return `${name}'s Clankr`;
  }
  if (conv.peerUser) {
    const name =
      conv.peerUser.profile?.displayName || conv.peerUser.username;
    return `Chat with ${name}'s Clankr`;
  }
  return "Agent Conversation";
}

export function AgentConversationThread({
  conversation,
  currentUserAvatarUrl,
}: {
  conversation: ConversationDetail;
  currentUserAvatarUrl: string | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  const scrollToBottom = useCallback(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [conversation.messages, scrollToBottom]);

  // Poll for new messages in active conversations
  useEffect(() => {
    if (conversation.status !== "ACTIVE") return;
    const interval = setInterval(() => {
      router.refresh();
    }, 2500);
    return () => clearInterval(interval);
  }, [conversation.status, router]);

  return (
    <div className="flex h-full flex-col px-4">
      {/* Header */}
      <div className="flex items-center gap-3 border-b py-3">
        <Link href="/agent-chats" className="md:hidden">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <Bot className="h-5 w-5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {conversationTitle(conversation)}
          </p>
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className={`text-[10px] ${statusColors[conversation.status] || ""}`}
            >
              {conversation.status}
            </Badge>
            {conversation.connectionRequest && (
              <span className="text-xs text-muted-foreground">
                {conversation.connectionRequest.category}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Context banner */}
      {conversation.connectionRequest && (
        <div className="border-b bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <span className="font-medium">Intent:</span>{" "}
          {conversation.connectionRequest.intent}
        </div>
      )}

      {/* Decision banner */}
      {conversation.decision && (
        <div className="border-b bg-blue-50 px-3 py-2 text-xs">
          <span className="font-medium">Decision:</span>{" "}
          {conversation.decision}
          {conversation.confidence != null && (
            <span className="ml-2 text-muted-foreground">
              ({Math.round(conversation.confidence * 100)}% confidence)
            </span>
          )}
          {conversation.reason && (
            <span className="ml-2 text-muted-foreground">
              &mdash; {conversation.reason}
            </span>
          )}
        </div>
      )}

      {/* Messages */}
      <div ref={scrollRef} className="flex-1 space-y-4 overflow-y-auto py-4">
        {conversation.messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            No messages in this conversation yet.
          </div>
        ) : (
          conversation.messages.map((msg) => {
            const isAgent = msg.role === "AGENT";
            const isSystem = msg.role === "SYSTEM";
            const peerAvatarUrl =
              conversation.connectionRequest?.fromUser.profile?.avatarUrl ||
              conversation.peerUser?.profile?.avatarUrl ||
              null;
            const avatarUrl = isAgent ? currentUserAvatarUrl : isSystem ? null : peerAvatarUrl;

            return (
              <div
                key={msg.id}
                className={`flex ${isAgent ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[80%] rounded-lg px-4 py-2 ${roleBg[msg.role] || "bg-muted"}`}>
                  <div className="mb-1 flex items-center gap-1.5">
                    <Avatar className="h-4 w-4">
                      <AvatarImage src={avatarUrl || undefined} />
                      <AvatarFallback className="text-[8px]">
                        {roleIcons[msg.role] || msg.role[0]}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-[10px] font-medium uppercase opacity-70">
                      {msg.role}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{msg.content}</p>
                  <div className="mt-1 flex items-center gap-2">
                    <p
                      className={`text-xs ${
                        isAgent
                          ? "text-primary-foreground/70"
                          : isSystem
                            ? "text-yellow-700/70"
                            : "text-muted-foreground"
                      }`}
                    >
                      {new Date(msg.createdAt).toLocaleTimeString()}
                    </p>
                    {msg.tokenCount != null && (
                      <span
                        className={`text-[10px] ${
                          isAgent
                            ? "text-primary-foreground/50"
                            : "text-muted-foreground/50"
                        }`}
                      >
                        {msg.tokenCount} tokens
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Read-only footer */}
      <div className="border-t py-3 text-center text-xs text-muted-foreground">
        This is a read-only view of your agent&apos;s conversation.
      </div>
    </div>
  );
}
