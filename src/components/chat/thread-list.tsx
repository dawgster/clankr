"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

interface ThreadItem {
  id: string;
  updatedAt: Date | string;
  participants: {
    userId: string;
    user: {
      id: string;
      username: string;
      profile: { displayName: string | null; avatarUrl: string | null } | null;
    };
  }[];
  messages: { content: string; createdAt: Date | string }[];
}

interface ThreadListProps {
  threads: ThreadItem[];
  currentUserId: string;
  activeThreadId?: string;
}

export function ThreadList({
  threads,
  currentUserId,
  activeThreadId,
}: ThreadListProps) {
  if (threads.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No conversations yet. Connect with someone to start messaging.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {threads.map((thread) => {
        const otherParticipant = thread.participants.find(
          (p) => p.userId !== currentUserId,
        );
        const otherUser = otherParticipant?.user;
        const profile = otherUser?.profile;
        const lastMessage = thread.messages[0];
        const isActive = thread.id === activeThreadId;

        return (
          <Link
            key={thread.id}
            href={`/messages/${thread.id}`}
            className={cn(
              "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50",
              isActive && "bg-accent",
            )}
          >
            <Avatar className="h-10 w-10 shrink-0">
              <AvatarImage src={profile?.avatarUrl || undefined} />
              <AvatarFallback>
                {profile?.displayName?.slice(0, 2).toUpperCase() || "??"}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-sm font-medium">
                  {profile?.displayName || otherUser?.username || "User"}
                </p>
                {lastMessage && (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(lastMessage.createdAt).toLocaleDateString()}
                  </span>
                )}
              </div>
              {lastMessage && (
                <p className="truncate text-xs text-muted-foreground">
                  {lastMessage.content}
                </p>
              )}
            </div>
          </Link>
        );
      })}
    </div>
  );
}
