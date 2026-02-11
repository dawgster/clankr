"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type {
  Negotiation,
  User as UserType,
  Profile,
  AgentEvent,
} from "@/generated/prisma/client";

type NegotiationWithRelations = Negotiation & {
  buyer: UserType & { profile: Profile | null };
  events: AgentEvent[];
};

const statusColors: Record<string, string> = {
  ACTIVE: "bg-blue-100 text-blue-800",
  ACCEPTED: "bg-green-100 text-green-800",
  REJECTED: "bg-red-100 text-red-800",
  EXPIRED: "bg-gray-100 text-gray-800",
};

const eventStatusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  DELIVERED: "bg-blue-100 text-blue-800",
  DECIDED: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-800",
};

export function NegotiationView({
  negotiation,
}: {
  negotiation: NegotiationWithRelations;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            Offer: ${negotiation.offerPrice.toLocaleString()}
          </CardTitle>
          <Badge className={statusColors[negotiation.status] || ""}>
            {negotiation.status}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          From {negotiation.buyer.profile?.displayName || negotiation.buyer.username}
        </p>
      </CardHeader>
      <CardContent>
        {negotiation.events.length > 0 ? (
          <div className="max-h-60 space-y-2 overflow-y-auto">
            {negotiation.events
              .sort(
                (a, b) =>
                  new Date(a.createdAt).getTime() -
                  new Date(b.createdAt).getTime(),
              )
              .map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2"
                >
                  <div>
                    <Badge variant="outline" className="text-xs">
                      {event.type.replace(/_/g, " ")}
                    </Badge>
                    {event.decision && (
                      <span className="ml-2 text-xs text-muted-foreground">
                        {JSON.stringify(event.decision)}
                      </span>
                    )}
                  </div>
                  <Badge
                    className={`text-xs ${eventStatusColors[event.status] || ""}`}
                  >
                    {event.status}
                  </Badge>
                </div>
              ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            {negotiation.status === "ACTIVE"
              ? "Waiting for agent response..."
              : "No events recorded."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
