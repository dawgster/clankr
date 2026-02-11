import { inngest } from "../client";
import { db } from "@/lib/db";

export const evaluateConnection = inngest.createFunction(
  { id: "evaluate-connection" },
  { event: "connection/request.created" },
  async ({ event, step }) => {
    const { requestId } = event.data;

    const outcome = await step.run("evaluate", async () => {
      const request = await db.connectionRequest.findUnique({
        where: { id: requestId },
        include: {
          fromUser: { include: { profile: true } },
          toUser: {
            include: {
              externalAgent: true,
            },
          },
        },
      });

      if (!request) return { type: "skip" as const };

      const agent = request.toUser.externalAgent;

      // No active agent — leave PENDING, notify user to connect an agent
      if (!agent || agent.status !== "ACTIVE") {
        await db.notification.create({
          data: {
            userId: request.toUserId,
            type: "CONNECTION_REQUEST",
            title: "New connection request",
            body: "Connect an agent to process requests automatically.",
            metadata: { requestId },
          },
        });
        return { type: "no_agent" as const };
      }

      // Create conversation + event
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
          },
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });

      return { type: "event_created" as const, eventId: agentEvent.id };
    });

    if (outcome.type === "event_created") {
      await inngest.send({
        name: "agent/event.created",
        data: { eventId: outcome.eventId },
      });
    }

    return outcome;
  },
);
