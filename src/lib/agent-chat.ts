import { db } from "./db";
import crypto from "crypto";

/**
 * Send an agent-to-agent chat message.
 *
 * Creates AgentConversation + AgentMessage on both sides (sender and
 * recipient), linked by a shared chatThreadId. Creates an AgentEvent
 * (NEW_MESSAGE) for the recipient's agent.
 *
 * Returns the created event ID, or null if the target has no active agent.
 */
export async function sendAgentChatMessage(
  senderAgent: { id: string; userId: string },
  targetUserId: string,
  content: string,
): Promise<{ eventId: string; chatThreadId: string } | null> {
  // Find target user's active agent up front. If missing, do not create
  // one-sided conversation records.
  const targetAgent = await db.externalAgent.findFirst({
    where: { userId: targetUserId, status: "ACTIVE" },
    select: { id: true },
  });

  if (!targetAgent) return null;

  // Find or create a chatThreadId linking both agents' conversations
  const existingConversation = await db.agentConversation.findFirst({
    where: {
      externalAgentId: senderAgent.id,
      peerUserId: targetUserId,
      chatThreadId: { not: null },
    },
    select: { chatThreadId: true },
    orderBy: { updatedAt: "desc" },
  });

  const chatThreadId =
    existingConversation?.chatThreadId ?? crypto.randomUUID();

  const { eventId } = await db.$transaction(async (tx) => {
    // Ensure sender has a conversation for this thread
    let senderConversation = await tx.agentConversation.findFirst({
      where: {
        externalAgentId: senderAgent.id,
        chatThreadId,
      },
    });

    if (!senderConversation) {
      senderConversation = await tx.agentConversation.create({
        data: {
          externalAgentId: senderAgent.id,
          chatThreadId,
          peerUserId: targetUserId,
          status: "ACTIVE",
        },
      });
    }

    // Record outgoing message in sender's conversation
    await tx.agentMessage.create({
      data: {
        conversationId: senderConversation.id,
        role: "AGENT",
        content,
      },
    });

    await tx.agentConversation.update({
      where: { id: senderConversation.id },
      data: { updatedAt: new Date() },
    });

    // Ensure recipient has a conversation for this thread
    let recipientConversation = await tx.agentConversation.findFirst({
      where: {
        externalAgentId: targetAgent.id,
        chatThreadId,
      },
    });

    if (!recipientConversation) {
      recipientConversation = await tx.agentConversation.create({
        data: {
          externalAgentId: targetAgent.id,
          chatThreadId,
          peerUserId: senderAgent.userId,
          status: "ACTIVE",
        },
      });
    }

    // Record incoming message in recipient's conversation
    await tx.agentMessage.create({
      data: {
        conversationId: recipientConversation.id,
        role: "USER",
        content,
      },
    });

    await tx.agentConversation.update({
      where: { id: recipientConversation.id },
      data: { updatedAt: new Date() },
    });

    // Look up sender info for the event payload
    const senderUser = await tx.user.findUnique({
      where: { id: senderAgent.userId },
      include: { profile: true },
    });

    // Create AgentEvent for the recipient
    const agentEvent = await tx.agentEvent.create({
      data: {
        externalAgentId: targetAgent.id,
        type: "NEW_MESSAGE",
        conversationId: recipientConversation.id,
        payload: {
          chatThreadId,
          senderUserId: senderAgent.userId,
          sender: {
            username: senderUser?.username ?? "unknown",
            displayName:
              senderUser?.profile?.displayName ?? senderUser?.username ?? "unknown",
          },
          content,
        },
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return { eventId: agentEvent.id };
  });

  return { eventId, chatThreadId };
}
