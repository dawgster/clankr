import { inngest } from "../client";
import { db } from "@/lib/db";

export const negotiationTurn = inngest.createFunction(
  { id: "negotiation-turn" },
  { event: "negotiation/offer.created" },
  async ({ event, step }) => {
    const { negotiationId, message } = event.data;

    const outcome = await step.run("setup-negotiation", async () => {
      const negotiation = await db.negotiation.findUnique({
        where: { id: negotiationId },
        include: {
          listing: true,
          buyer: { include: { profile: true, externalAgent: true } },
          seller: { include: { profile: true, externalAgent: true } },
        },
      });

      if (!negotiation) return { type: "not_found" as const };

      const sellerAgent = negotiation.seller.externalAgent;
      const buyerAgent = negotiation.buyer.externalAgent;

      // If either has no active agent, expire negotiation
      if (
        !sellerAgent ||
        sellerAgent.status !== "ACTIVE" ||
        !buyerAgent ||
        buyerAgent.status !== "ACTIVE"
      ) {
        await db.negotiation.update({
          where: { id: negotiationId },
          data: { status: "EXPIRED" },
        });
        for (const userId of [negotiation.buyerId, negotiation.sellerId]) {
          await db.notification.create({
            data: {
              userId,
              type: "NEGOTIATION_UPDATE",
              title: "Negotiation expired",
              body: `Negotiation for "${negotiation.listing.title}" expired — both parties must have an active agent.`,
              metadata: { negotiationId },
            },
          });
        }
        return { type: "no_agents" as const };
      }

      // Create conversation + event for seller
      const conversation = await db.agentConversation.create({
        data: {
          externalAgentId: sellerAgent.id,
          negotiationId,
          status: "ACTIVE",
        },
      });

      const listing = negotiation.listing;
      const buyerProfile = negotiation.buyer.profile;

      const agentEvent = await db.agentEvent.create({
        data: {
          externalAgentId: sellerAgent.id,
          type: "NEGOTIATION_OFFER",
          negotiationId,
          conversationId: conversation.id,
          payload: {
            negotiationId,
            listing: {
              title: listing.title,
              price: listing.price,
            },
            offerPrice: negotiation.offerPrice,
            buyer: {
              username: negotiation.buyer.username,
              displayName: buyerProfile?.displayName || negotiation.buyer.username,
            },
            message: message || null,
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
