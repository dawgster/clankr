import { inngest } from "../client";
import { db } from "@/lib/db";

export const expireAgentEvents = inngest.createFunction(
  { id: "expire-agent-events" },
  { event: "agent/event.timeout" },
  async ({ event, step }) => {
    const { eventId } = event.data;

    await step.run("expire", async () => {
      const agentEvent = await db.agentEvent.findUnique({
        where: { id: eventId },
        include: {
          externalAgent: true,
          connectionRequest: true,
          negotiation: { include: { listing: true } },
        },
      });

      if (!agentEvent) return;

      // Only expire if still pending/delivered
      if (agentEvent.status !== "PENDING" && agentEvent.status !== "DELIVERED") {
        return;
      }

      await db.agentEvent.update({
        where: { id: eventId },
        data: { status: "EXPIRED" },
      });

      // Handle connection request expiry
      if (agentEvent.connectionRequest && agentEvent.externalAgent.userId) {
        await db.notification.create({
          data: {
            userId: agentEvent.externalAgent.userId,
            type: "AGENT_DECISION",
            title: "Agent event expired",
            body: "A connection request event was not handled in time.",
            metadata: { eventId, requestId: agentEvent.connectionRequestId },
          },
        });
      }

      // Handle negotiation expiry
      if (agentEvent.negotiation) {
        await db.negotiation.update({
          where: { id: agentEvent.negotiationId! },
          data: { status: "EXPIRED" },
        });

        const neg = agentEvent.negotiation;
        for (const userId of [neg.buyerId, neg.sellerId]) {
          await db.notification.create({
            data: {
              userId,
              type: "NEGOTIATION_UPDATE",
              title: "Negotiation expired",
              body: `The negotiation for "${neg.listing.title}" expired — agent did not respond in time.`,
              metadata: { negotiationId: neg.id },
            },
          });
        }
      }
    });
  },
);
