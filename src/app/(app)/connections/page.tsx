import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { MessageSquare } from "lucide-react";

export default async function ConnectionsPage() {
  const user = await requireUser();

  const connections = await db.connection.findMany({
    where: {
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    include: {
      userA: { include: { profile: true } },
      userB: { include: { profile: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connections</h1>
        <p className="text-muted-foreground">
          People you&apos;re connected with. You can message them directly.
        </p>
      </div>

      {connections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No connections yet.{" "}
            <Link href="/discover" className="text-primary underline">
              Discover people
            </Link>{" "}
            to connect with.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {connections.map((conn) => {
            const other =
              conn.userAId === user.id ? conn.userB : conn.userA;
            const profile = other.profile;
            if (!profile) return null;

            return (
              <Card key={conn.id}>
                <CardContent className="flex items-center justify-between p-4">
                  <Link
                    href={`/profile/${other.username}`}
                    className="flex items-center gap-3"
                  >
                    <Avatar>
                      <AvatarImage src={profile.avatarUrl || undefined} />
                      <AvatarFallback>
                        {profile.displayName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{profile.displayName}</p>
                      <p className="text-sm text-muted-foreground">
                        @{other.username}
                      </p>
                    </div>
                  </Link>
                  <Link href={`/messages?with=${other.id}`}>
                    <Button variant="outline" size="sm">
                      <MessageSquare className="mr-2 h-4 w-4" />
                      Message
                    </Button>
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
