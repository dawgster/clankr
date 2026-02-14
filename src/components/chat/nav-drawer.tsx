"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useDrawer } from "./drawer-context";
import { UserButton } from "@clerk/nextjs";
import {
  Sheet,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  LayoutDashboard,
  User,
  Bot,
  BotMessageSquare,
  Users,
  MessageSquare,
  MessageCircle,
  Search,
  Bell,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/connections", label: "Connections", icon: Users },
  { href: "/requests", label: "Requests", icon: Bell },
  { href: "/agent", label: "My Agent", icon: Bot },
  { href: "/agent-chat", label: "Agent Chat", icon: MessageCircle },
  { href: "/agent-chats", label: "Agent Chats", icon: BotMessageSquare },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/profile/edit", label: "Profile", icon: User },
];

export function NavDrawer() {
  const { open, closeDrawer } = useDrawer();
  const pathname = usePathname();

  return (
    <Sheet open={open} onOpenChange={(v) => !v && closeDrawer()}>
      <SheetContent side="left" className="w-72 p-0">
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <div className="flex h-14 items-center border-b px-5">
          <Link
            href="/messages"
            className="flex items-center gap-2"
            onClick={closeDrawer}
          >
            <Bot className="h-6 w-6 text-primary" />
            <span className="text-lg font-bold tracking-tight">clankr</span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive =
              pathname === item.href || pathname.startsWith(item.href + "/");
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={closeDrawer}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto border-t p-4">
          <UserButton
            afterSignOutUrl="/"
            appearance={{ elements: { avatarBox: "h-8 w-8" } }}
          />
        </div>
      </SheetContent>
    </Sheet>
  );
}
