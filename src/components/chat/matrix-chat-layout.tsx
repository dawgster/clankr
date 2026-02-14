"use client";

import { usePathname } from "next/navigation";
import { ChatListHeader } from "./chat-list-header";
import { MatrixThreadList } from "./matrix-thread-list";
import { cn } from "@/lib/utils";

interface ConnectionItem {
  id: string;
  createdAt: Date | string;
  otherUser: {
    id: string;
    username: string;
    profile: {
      displayName: string | null;
      avatarUrl: string | null;
    } | null;
  };
}

interface MatrixChatLayoutProps {
  connections: ConnectionItem[];
  children: React.ReactNode;
}

export function MatrixChatLayout({
  connections,
  children,
}: MatrixChatLayoutProps) {
  const pathname = usePathname();
  const isInThread = pathname !== "/messages";
  const activeConnectionId = isInThread ? pathname.split("/").pop() : undefined;

  return (
    <div className="flex h-screen">
      {/* Left panel — connection list */}
      <div
        className={cn(
          "flex h-full w-full flex-col border-r md:w-[350px] md:shrink-0",
          isInThread && "hidden md:flex",
        )}
      >
        <ChatListHeader />
        <MatrixThreadList
          connections={connections}
          activeConnectionId={activeConnectionId}
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
