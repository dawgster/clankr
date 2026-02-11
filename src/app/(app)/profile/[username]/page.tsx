import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ConnectButton } from "@/components/connection/connect-button";

export default async function ProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;

  const profileUser = await db.user.findUnique({
    where: { username },
    include: {
      profile: true,
      externalAgent: { select: { status: true, name: true } },
      _count: {
        select: {
          connectionsA: true,
          connectionsB: true,
        },
      },
    },
  });

  if (!profileUser || !profileUser.profile) notFound();

  const currentUser = await getCurrentUser();
  const isOwnProfile = currentUser?.id === profileUser.id;

  // Check connection status
  let connectionStatus: string | null = null;
  if (currentUser && !isOwnProfile) {
    const connection = await db.connection.findFirst({
      where: {
        OR: [
          { userAId: currentUser.id, userBId: profileUser.id },
          { userAId: profileUser.id, userBId: currentUser.id },
        ],
      },
    });
    if (connection) {
      connectionStatus = "connected";
    } else {
      const request = await db.connectionRequest.findFirst({
        where: {
          OR: [
            { fromUserId: currentUser.id, toUserId: profileUser.id },
            { fromUserId: profileUser.id, toUserId: currentUser.id },
          ],
          status: { in: ["PENDING", "IN_CONVERSATION"] },
        },
      });
      if (request) connectionStatus = "pending";
    }
  }

  const profile = profileUser.profile;
  const connectionCount =
    profileUser._count.connectionsA + profileUser._count.connectionsB;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="h-20 w-20">
            <AvatarImage src={profile.avatarUrl || undefined} />
            <AvatarFallback className="text-2xl">
              {profile.displayName.slice(0, 2).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h1 className="text-2xl font-bold">{profile.displayName}</h1>
            <p className="text-sm text-muted-foreground">
              @{profileUser.username}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              {connectionCount} connection{connectionCount !== 1 ? "s" : ""}
            </p>
          </div>
          {!isOwnProfile && currentUser && (
            <ConnectButton
              toUserId={profileUser.id}
              status={connectionStatus}
            />
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {profile.bio && <p>{profile.bio}</p>}

          {profile.intent && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                Intent
              </h3>
              <p className="text-sm">{profile.intent}</p>
            </div>
          )}

          {profile.interests.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                Interests
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.interests.map((interest) => (
                  <Badge key={interest} variant="secondary">
                    {interest}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {profile.lookingFor.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-medium text-muted-foreground">
                Looking For
              </h3>
              <div className="flex flex-wrap gap-2">
                {profile.lookingFor.map((item) => (
                  <Badge key={item} variant="outline">
                    {item}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {profileUser.externalAgent?.status === "ACTIVE" && (
            <div className="rounded-lg border bg-muted/50 p-4">
              <h3 className="mb-2 text-sm font-medium">Agent</h3>
              <p className="text-sm text-muted-foreground">
                {profileUser.externalAgent.name} — connected
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
