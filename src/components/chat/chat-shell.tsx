"use client";

import { usePathname } from "next/navigation";
import { DrawerProvider, useDrawer } from "./drawer-context";
import { NavDrawer } from "./nav-drawer";
import { Button } from "@/components/ui/button";
import { UserButton } from "@clerk/nextjs";
import { Menu, Bot } from "lucide-react";

function TopBar() {
  const { openDrawer } = useDrawer();

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
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
    </header>
  );
}

function ShellInner({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isMessagesRoute = pathname.startsWith("/messages");

  if (isMessagesRoute) {
    return (
      <>
        <NavDrawer />
        {children}
      </>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <NavDrawer />
      <TopBar />
      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

export function ChatShell({ children }: { children: React.ReactNode }) {
  return (
    <DrawerProvider>
      <ShellInner>{children}</ShellInner>
    </DrawerProvider>
  );
}
