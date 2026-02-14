"use client";

import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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

interface MatrixThreadListProps {
  connections: ConnectionItem[];
  activeConnectionId?: string;
}

export function MatrixThreadList({
  connections,
  activeConnectionId,
}: MatrixThreadListProps) {
  if (connections.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-muted-foreground">
        No conversations yet. Connect with someone to start messaging.
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      {connections.map((conn) => {
        const profile = conn.otherUser.profile;
        const isActive = conn.id === activeConnectionId;

        return (
          <Link
            key={conn.id}
            href={`/messages/${conn.id}`}
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
              <p className="truncate text-sm font-medium">
                {profile?.displayName || conn.otherUser.username || "User"}
              </p>
              <p className="text-xs text-muted-foreground">
                Connected{" "}
                {new Date(conn.createdAt).toLocaleDateString()}
              </p>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
