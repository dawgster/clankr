"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
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
  Sparkles,
} from "lucide-react";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/intent", label: "My Intent", icon: Sparkles },
  { href: "/discover", label: "Discover", icon: Search },
  { href: "/requests", label: "Requests", icon: Bell },
  { href: "/connections", label: "Connections", icon: Users },
  { href: "/messages", label: "Messages", icon: MessageSquare },
  { href: "/agent-chat", label: "Agent Chat", icon: MessageCircle },
  { href: "/agent-chats", label: "Agent Chats", icon: BotMessageSquare },
  { href: "/agent", label: "My Agent", icon: Bot },
  { href: "/profile/edit", label: "Profile", icon: User },
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed left-0 top-0 z-30 flex h-screen w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="flex items-center gap-2">
          <Bot className="h-7 w-7 text-primary" />
          <span className="text-xl font-bold tracking-tight">clankr</span>
        </Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems.map((item) => {
          const isActive =
            pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
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
    </aside>
  );
}
