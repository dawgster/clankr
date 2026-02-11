import { inngest } from "../client";
import { db } from "@/lib/db";

export const processNegotiationTurn = inngest.createFunction(
  { id: "process-negotiation-turn" },
  { event: "agent/negotiation.turn" },
  async ({ event, step }) => {
    const { negotiationId, counterPrice, reason } = event.data;

    const outcome = await step.run("create-counter-event", async () => {
      const negotiation = await db.negotiation.findUnique({
        where: { id: negotiationId },
        include: {
          listing: true,
          buyer: { include: { externalAgent: true, profile: true } },
          seller: { include: { externalAgent: true, profile: true } },
        },
      });

      if (!negotiation || negotiation.status !== "ACTIVE") {
        return { type: "skip" as const };
      }

      // Find the last event to determine who made the counter — the counterparty is the other side
      const lastEvent = await db.agentEvent.findFirst({
        where: { negotiationId, status: "DECIDED" },
        orderBy: { updatedAt: "desc" },
      });

      // Determine counterparty: if last event was for seller's agent, counter goes to buyer, and vice versa
      const lastAgentId = lastEvent?.externalAgentId;
      const isSellerLast = lastAgentId === negotiation.seller.externalAgent?.id;
      const counterparty = isSellerLast ? negotiation.buyer : negotiation.seller;
      const counterpartyAgent = counterparty.externalAgent;

      if (!counterpartyAgent || counterpartyAgent.status !== "ACTIVE") {
        await db.negotiation.update({
          where: { id: negotiationId },
          data: { status: "EXPIRED" },
        });
        return { type: "no_agent" as const };
      }

      const conversation = await db.agentConversation.create({
        data: {
          externalAgentId: counterpartyAgent.id,
          negotiationId,
          status: "ACTIVE",
        },
      });

      const agentEvent = await db.agentEvent.create({
        data: {
          externalAgentId: counterpartyAgent.id,
          type: "NEGOTIATION_TURN",
          negotiationId,
          conversationId: conversation.id,
          payload: {
            negotiationId,
            listing: {
              title: negotiation.listing.title,
              price: negotiation.listing.price,
            },
            counterPrice,
            reason: reason || null,
            offerPrice: negotiation.offerPrice,
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
