"use client";

import { Bot } from "lucide-react";

export default function AgentChatsPage() {
  return (
    <div className="hidden md:flex flex-1 items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-muted-foreground">
        <Bot className="h-12 w-12" />
        <p className="text-lg font-medium">Select an agent conversation</p>
      </div>
    </div>
  );
}
