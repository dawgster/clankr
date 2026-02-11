"use client";

import { usePathname } from "next/navigation";
import { ChatListHeader } from "./chat-list-header";
import { ThreadList } from "./thread-list";
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

interface ChatLayoutProps {
  threads: ThreadItem[];
  currentUserId: string;
  children: React.ReactNode;
}

export function ChatLayout({
  threads,
  currentUserId,
  children,
}: ChatLayoutProps) {
  const pathname = usePathname();
  const isInThread = pathname !== "/messages";
  const activeThreadId = isInThread ? pathname.split("/").pop() : undefined;

  return (
    <div className="flex h-screen">
      {/* Left panel — chat list */}
      <div
        className={cn(
          "flex h-full w-full flex-col border-r md:w-[350px] md:shrink-0",
          isInThread && "hidden md:flex",
        )}
      >
        <ChatListHeader />
        <ThreadList
          threads={threads}
          currentUserId={currentUserId}
          activeThreadId={activeThreadId}
        />
      </div>

      {/* Right panel — conversation or empty state */}
      <div
        className={cn(
          "flex h-full min-w-0 flex-1 flex-col",
          !isInThread && "hidden md:flex",
        )}
      >
        {children}
      </div>
    </div>
  );
}
