import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import {
  Users,
  Bot,
  MessageSquare,
  Bell,
  ArrowRight,
} from "lucide-react";

export default async function DashboardPage() {
  const user = await requireUser();
  if (!user.profile) redirect("/onboarding");

  const [
    connectionCount,
    pendingRequests,
    unreadNotifications,
    recentNotifications,
    agentConversations,
  ] = await Promise.all([
    db.connection.count({
      where: { OR: [{ userAId: user.id }, { userBId: user.id }] },
    }),
    db.connectionRequest.count({
      where: {
        toUserId: user.id,
        status: { in: ["PENDING", "IN_CONVERSATION"] },
      },
    }),
    db.notification.count({
      where: { userId: user.id, read: false },
    }),
    db.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    db.agentEvent.count({
      where: {
        externalAgent: { userId: user.id },
        status: { in: ["PENDING", "DELIVERED"] },
      },
    }),
  ]);

  const stats = [
    {
      label: "Connections",
      value: connectionCount,
      icon: Users,
      href: "/connections",
    },
    {
      label: "Pending Requests",
      value: pendingRequests,
      icon: Bell,
      href: "/requests",
    },
    {
      label: "Pending Agent Events",
      value: agentConversations,
      icon: Bot,
      href: "/agent",
    },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">
          Welcome back, {user.profile.displayName}
        </h1>
        <p className="text-muted-foreground">
          Here&apos;s what&apos;s happening with your network.
        </p>
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {stats.map((stat) => (
          <Link key={stat.label} href={stat.href}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardContent className="flex items-center gap-4 p-4">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <stat.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-sm text-muted-foreground">{stat.label}</p>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/discover">
          <Button variant="outline" className="w-full justify-between">
            Discover People
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
        <Link href="/agent">
          <Button variant="outline" className="w-full justify-between">
            Manage Agent
            <ArrowRight className="h-4 w-4" />
          </Button>
        </Link>
      </div>

      {/* Notifications */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-lg">Recent Activity</CardTitle>
          {unreadNotifications > 0 && (
            <Badge>{unreadNotifications} unread</Badge>
          )}
        </CardHeader>
        <CardContent>
          {recentNotifications.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No activity yet. Start by discovering people to connect with.
            </p>
          ) : (
            <div className="space-y-3">
              {recentNotifications.map((notif) => (
                <div
                  key={notif.id}
                  className={`flex items-start gap-3 rounded-lg p-3 ${
                    !notif.read ? "bg-primary/5" : ""
                  }`}
                >
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    {notif.type.includes("CONNECTION") ? (
                      <Users className="h-4 w-4" />
                    ) : notif.type.includes("MESSAGE") ? (
                      <MessageSquare className="h-4 w-4" />
                    ) : notif.type.includes("AGENT") ? (
                      <Bot className="h-4 w-4" />
                    ) : (
                      <Bell className="h-4 w-4" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{notif.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {notif.body}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {new Date(notif.createdAt).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
