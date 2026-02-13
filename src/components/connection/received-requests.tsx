"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { overrideAgentDecision } from "@/lib/actions/connection";
import type {
  ConnectionRequest,
  User,
  Profile,
  AgentEvent,
} from "@/generated/prisma/client";

type ReceivedRequest = ConnectionRequest & {
  fromUser: User & { profile: Profile | null };
  events: Pick<AgentEvent, "id" | "status">[];
};

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  IN_CONVERSATION: "bg-blue-100 text-blue-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  CANCELLED: "bg-gray-100 text-gray-800",
};

export function ReceivedRequests({
  requests,
}: {
  requests: ReceivedRequest[];
  hasActiveAgent?: boolean;
}) {
  const router = useRouter();

  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No received requests yet.
        </CardContent>
      </Card>
    );
  }

  async function handleOverride(
    requestId: string,
    decision: "ACCEPTED" | "REJECTED",
  ) {
    await overrideAgentDecision(requestId, decision);
    router.refresh();
  }

  return (
    <div className="space-y-3">
      {requests.map((req) => {
        const profile = req.fromUser.profile;
        const isDecided = req.status === "ACCEPTED" || req.status === "REJECTED";
        const agentProcessing = req.events.length > 0;

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
                      {profile?.displayName || req.fromUser.username}
                    </p>
                    <div className="mt-1 flex items-center gap-2">
                      <Badge variant="outline">
                        {req.category}
                      </Badge>
                      {req.stakeNear != null && req.stakeNear > 0 && (
                        <Badge variant="secondary">
                          {req.stakeNear} NEAR staked
                        </Badge>
                      )}
                    </div>
                    <p className="mt-2 text-sm">{req.intent}</p>
                  </div>
                </div>
                <Badge className={statusColors[req.status] || ""}>
                  {req.status.replace("_", " ")}
                </Badge>
              </div>

              {agentProcessing && !isDecided && (
                <AgentProcessingSection
                  requestId={req.id}
                  onOverride={handleOverride}
                />
              )}

              {!agentProcessing && !isDecided && (
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => handleOverride(req.id, "ACCEPTED")}
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleOverride(req.id, "REJECTED")}
                  >
                    Decline
                  </Button>
                </div>
              )}

              {isDecided && (
                <div className="mt-4 flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      handleOverride(
                        req.id,
                        req.status === "ACCEPTED" ? "REJECTED" : "ACCEPTED",
                      )
                    }
                  >
                    Override to{" "}
                    {req.status === "ACCEPTED" ? "Reject" : "Accept"}
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AgentProcessingSection({
  requestId,
  onOverride,
}: {
  requestId: string;
  onOverride: (requestId: string, decision: "ACCEPTED" | "REJECTED") => void;
}) {
  const [showOverride, setShowOverride] = useState(false);

  return (
    <div className="mt-4">
      <p className="text-sm text-muted-foreground">
        Your agent is reviewing this request.
      </p>
      {!showOverride ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-2 text-xs"
          onClick={() => setShowOverride(true)}
        >
          Override agent
        </Button>
      ) : (
        <div className="mt-2 flex gap-2">
          <Button size="sm" onClick={() => onOverride(requestId, "ACCEPTED")}>
            Accept
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onOverride(requestId, "REJECTED")}
          >
            Decline
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowOverride(false)}
          >
            Cancel
          </Button>
        </div>
      )}
    </div>
  );
}
