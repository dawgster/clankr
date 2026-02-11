"use client";

import { Menu, Bot } from "lucide-react";
import { Button } from "@/components/ui/button";
import { UserButton } from "@clerk/nextjs";
import { useDrawer } from "./drawer-context";

export function ChatListHeader() {
  const { openDrawer } = useDrawer();

  return (
    <div className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
      <Button variant="ghost" size="icon" onClick={openDrawer}>
        <Menu className="h-5 w-5" />
      </Button>
      <div className="flex items-center gap-2">
        <Bot className="h-5 w-5 text-primary" />
        <span className="text-lg font-bold tracking-tight">clankr</span>
      </div>
      <div className="ml-auto">
        <UserButton
          afterSignOutUrl="/"
          appearance={{ elements: { avatarBox: "h-7 w-7" } }}
        />
      </div>
    </div>
  );
}
