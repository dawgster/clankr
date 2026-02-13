import { db } from "./db";

type EnsureResult =
  | { type: "event_created"; eventId: string }
  | { type: "event_exists"; eventId: string }
  | { type: "no_agent" }
  | { type: "skip" };

/**
 * Ensure an AgentEvent exists for a connection request's target user.
 *
 * If the target user has an active external agent, this creates an
 * AgentConversation + AgentEvent so the agent can see and act on the
 * request immediately. If an event already exists it is returned
 * without creating a duplicate (idempotent).
 *
 * If the target user has no active agent, a notification is created
 * prompting them to connect one.
 */
export async function ensureAgentEventForRequest(
  requestId: string,
): Promise<EnsureResult> {
  const request = await db.connectionRequest.findUnique({
    where: { id: requestId },
    include: {
      fromUser: { include: { profile: true } },
      toUser: { include: { externalAgent: true } },
    },
  });

  if (!request) return { type: "skip" };

  const agent = request.toUser.externalAgent;

  if (!agent || agent.status !== "ACTIVE") {
    // No active agent — notify the user so they know to connect one.
    // Check for an existing notification to avoid duplicates.
    const existingNotif = await db.notification.findFirst({
      where: {
        userId: request.toUserId,
        type: "CONNECTION_REQUEST",
        metadata: { path: ["requestId"], equals: requestId },
      },
    });

    if (!existingNotif) {
      await db.notification.create({
        data: {
          userId: request.toUserId,
          type: "CONNECTION_REQUEST",
          title: "New connection request",
          body: "Connect an agent to process requests automatically.",
          metadata: { requestId },
        },
      });
    }

    return { type: "no_agent" };
  }

  // Check for an existing non-expired, non-decided event (idempotency).
  const existingEvent = await db.agentEvent.findFirst({
    where: {
      connectionRequestId: requestId,
      externalAgentId: agent.id,
      status: { in: ["PENDING", "DELIVERED"] },
    },
  });

  if (existingEvent) {
    return { type: "event_exists", eventId: existingEvent.id };
  }

  // Create conversation + event for the agent.
  const conversation = await db.agentConversation.create({
    data: {
      externalAgentId: agent.id,
      connectionRequestId: requestId,
      status: "ACTIVE",
    },
  });

  const fromProfile = request.fromUser.profile;

  const agentEvent = await db.agentEvent.create({
    data: {
      externalAgentId: agent.id,
      type: "CONNECTION_REQUEST",
      connectionRequestId: requestId,
      conversationId: conversation.id,
      payload: {
        requestId,
        fromUser: {
          username: request.fromUser.username,
          displayName: fromProfile?.displayName || request.fromUser.username,
          bio: fromProfile?.bio || "",
          interests: fromProfile?.interests || [],
        },
        category: request.category,
        intent: request.intent,
        stakeNear: request.stakeNear,
      },
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });

  return { type: "event_created", eventId: agentEvent.id };
}
