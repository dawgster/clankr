"use client";

import { MessageSquare } from "lucide-react";

export function EmptyState() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <MessageSquare className="h-12 w-12" />
        <p className="text-lg font-medium">Select a conversation</p>
      </div>
    </div>
  );
}
