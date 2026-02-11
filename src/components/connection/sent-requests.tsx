"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type {
  ConnectionRequest,
  User,
  Profile,
} from "@/generated/prisma/client";

type SentRequest = ConnectionRequest & {
  toUser: User & { profile: Profile | null };
};

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  IN_CONVERSATION: "bg-blue-100 text-blue-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

export function SentRequests({
  requests,
}: {
  requests: SentRequest[];
  currentUserId: string;
}) {
  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No sent requests yet. Discover people and send connection requests.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => {
        const profile = req.toUser.profile;

        return (
          <Card key={req.id}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-3">
                  <Avatar>
                    <AvatarImage src={profile?.avatarUrl || undefined} />
                    <AvatarFallback>
                      {profile?.displayName?.slice(0, 2).toUpperCase() || "??"}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">
                      {profile?.displayName || req.toUser.username}
                    </p>
                    <Badge variant="outline" className="mt-1">
                      {req.category}
                    </Badge>
                    <p className="mt-2 text-sm">{req.intent}</p>
                  </div>
                </div>
                <Badge className={statusColors[req.status] || ""}>
                  {req.status.replace("_", " ")}
                </Badge>
              </div>

              {req.status === "IN_CONVERSATION" && (
                <p className="mt-3 text-sm text-muted-foreground">
                  Their agent is reviewing your request...
                </p>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
