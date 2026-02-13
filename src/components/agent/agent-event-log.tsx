"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity } from "lucide-react";

type AgentEventItem = {
  id: string;
  type: string;
  status: string;
  payload: unknown;
  decision: unknown;
  createdAt: Date;
  connectionRequest: {
    id: string;
    intent: string;
    category: string;
    status: string;
    fromUser: {
      username: string;
      profile: { displayName: string } | null;
    };
  } | null;
};

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  DELIVERED: "bg-blue-100 text-blue-800",
  DECIDED: "bg-green-100 text-green-800",
  EXPIRED: "bg-gray-100 text-gray-800",
};

function eventDescription(event: AgentEventItem): string {
  if (event.connectionRequest) {
    const name =
      event.connectionRequest.fromUser.profile?.displayName ||
      event.connectionRequest.fromUser.username;
    return `Connection request from ${name}: "${event.connectionRequest.intent}"`;
  }
  return event.type.replace(/_/g, " ");
}

export function AgentEventLog({ events }: { events: AgentEventItem[] }) {
  if (events.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-muted-foreground">
          No agent events yet. Events will appear here when your agent receives
          connection requests.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Activity className="h-4 w-4" />
          Recent Events
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex items-start justify-between rounded-lg border p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-xs">
                    {event.type.replace(/_/g, " ")}
                  </Badge>
                  <Badge className={`text-xs ${statusColors[event.status] || ""}`}>
                    {event.status}
                  </Badge>
                </div>
                <p className="mt-1 text-sm">{eventDescription(event)}</p>
                {event.decision != null && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Decision: {JSON.stringify(event.decision)}
                  </p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(event.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
