"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  agentGatewaySchema,
  type AgentGatewayInput,
} from "@/lib/validators";

export async function getMyAgent() {
  const user = await requireUser();
  return db.externalAgent.findUnique({
    where: { userId: user.id },
    select: {
      id: true,
      name: true,
      apiKeyPrefix: true,
      status: true,
      gatewayUrl: true,
      webhookEnabled: true,
      lastSeenAt: true,
      createdAt: true,
    },
  });
}

export async function claimAgent(token: string) {
  const user = await requireUser();

  const existing = await db.externalAgent.findUnique({
    where: { userId: user.id },
  });
  if (existing) throw new Error("You already have a connected agent");

  const agent = await db.externalAgent.findUnique({
    where: { claimToken: token },
  });
  if (!agent) throw new Error("Invalid claim token");
  if (agent.status !== "UNCLAIMED") throw new Error("Agent already claimed");

  return db.externalAgent.update({
    where: { id: agent.id },
    data: {
      userId: user.id,
      status: "ACTIVE",
      claimToken: null,
    },
    select: { id: true, name: true, status: true },
  });
}

export async function updateGateway(input: AgentGatewayInput) {
  const user = await requireUser();
  const data = agentGatewaySchema.parse(input);

  const agent = await db.externalAgent.findUnique({
    where: { userId: user.id },
  });
  if (!agent) throw new Error("No agent connected");

  return db.externalAgent.update({
    where: { id: agent.id },
    data: {
      gatewayUrl: data.gatewayUrl,
      gatewayToken: data.gatewayToken ?? null,
      webhookEnabled: data.webhookEnabled,
    },
    select: {
      id: true,
      gatewayUrl: true,
      webhookEnabled: true,
    },
  });
}

export async function disconnectAgent() {
  const user = await requireUser();

  const agent = await db.externalAgent.findUnique({
    where: { userId: user.id },
  });
  if (!agent) throw new Error("No agent connected");

  return db.externalAgent.update({
    where: { id: agent.id },
    data: {
      userId: null,
      status: "SUSPENDED",
    },
  });
}

export async function getAgentConversations() {
  const user = await requireUser();

  const agent = await db.externalAgent.findUnique({
    where: { userId: user.id },
  });
  if (!agent) return [];

  const conversations = await db.agentConversation.findMany({
    where: { externalAgentId: agent.id },
    include: {
      connectionRequest: {
        select: {
          id: true,
          intent: true,
          category: true,
          status: true,
          fromUser: {
            select: {
              username: true,
              profile: { select: { displayName: true, avatarUrl: true } },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      _count: { select: { messages: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  // Enrich chat conversations with peer user info
  const peerUserIds = conversations
    .filter((c) => c.chatThreadId && c.peerUserId)
    .map((c) => c.peerUserId!);

  const peerUsers =
    peerUserIds.length > 0
      ? await db.user.findMany({
          where: { id: { in: peerUserIds } },
          select: {
            id: true,
            username: true,
            profile: { select: { displayName: true, avatarUrl: true } },
          },
        })
      : [];

  const peerUserMap = new Map(peerUsers.map((u) => [u.id, u]));

  return conversations.map((c) => ({
    ...c,
    peerUser: c.peerUserId ? (peerUserMap.get(c.peerUserId) ?? null) : null,
  }));
}

export async function getAgentConversation(conversationId: string) {
  const user = await requireUser();

  const agent = await db.externalAgent.findUnique({
    where: { userId: user.id },
  });
  if (!agent) return null;

  const conversation = await db.agentConversation.findFirst({
    where: { id: conversationId, externalAgentId: agent.id },
    include: {
      connectionRequest: {
        select: {
          id: true,
          intent: true,
          category: true,
          status: true,
          fromUser: {
            select: {
              username: true,
              profile: { select: { displayName: true, avatarUrl: true } },
            },
          },
        },
      },
      messages: {
        orderBy: { createdAt: "asc" },
      },
      events: {
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!conversation) return null;

  const peerUser = conversation.peerUserId
    ? await db.user.findUnique({
        where: { id: conversation.peerUserId },
        select: {
          id: true,
          username: true,
          profile: { select: { displayName: true, avatarUrl: true } },
        },
      })
    : null;

  return { ...conversation, peerUser };
}

export async function getAgentEvents() {
  const user = await requireUser();

  const agent = await db.externalAgent.findUnique({
    where: { userId: user.id },
  });
  if (!agent) return [];

  return db.agentEvent.findMany({
    where: { externalAgentId: agent.id },
    include: {
      connectionRequest: {
        select: {
          id: true,
          intent: true,
          category: true,
          status: true,
          fromUser: {
            select: {
              username: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
