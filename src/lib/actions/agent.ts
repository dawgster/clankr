"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  agentGatewaySchema,
  type AgentGatewayInput,
} from "@/lib/validators";
import { provisionAgentMatrixAccount } from "@/lib/matrix/provisioning";
import { createNearSubAccount } from "@/lib/near/account";
import { requestFaucetFunds } from "@/lib/near/faucet";
import { getNearBalance } from "@/lib/near/balance";

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
      nearAccountId: true,
      matrixUserId: true,
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

  const claimed = await db.externalAgent.update({
    where: { id: agent.id },
    data: {
      userId: user.id,
      status: "ACTIVE",
      claimToken: null,
    },
    select: { id: true, name: true, status: true, matrixAccessToken: true },
  });

  // Auto-provision Matrix account for the agent (best-effort)
  try {
    await provisionAgentMatrixAccount(claimed);
  } catch (err) {
    console.error("Failed to provision Matrix account for agent:", err);
  }

  return { id: claimed.id, name: claimed.name, status: claimed.status };
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

export async function provisionAgentAccounts(opts: {
  near?: boolean;
  matrix?: boolean;
}) {
  const user = await requireUser();

  const agent = await db.externalAgent.findUnique({
    where: { userId: user.id },
  });
  if (!agent) throw new Error("No agent connected");

  let nearProvisioned = !!agent.nearAccountId;
  let matrixProvisioned = !!agent.matrixUserId;
  const errors: string[] = [];

  if (opts.near && !agent.nearAccountId) {
    try {
      const result = await createNearSubAccount(agent.id);
      await db.externalAgent.update({
        where: { id: agent.id },
        data: {
          nearAccountId: result.accountId,
          nearPublicKey: result.publicKey,
          nearEncryptedPrivateKey: result.encryptedPrivateKey,
        },
      });
      nearProvisioned = true;
    } catch (err) {
      console.error("Failed to provision NEAR wallet:", err);
      errors.push("NEAR wallet: " + (err instanceof Error ? err.message : "unknown error"));
    }
  }

  if (opts.matrix && !agent.matrixAccessToken) {
    try {
      await provisionAgentMatrixAccount(agent);
      matrixProvisioned = true;
    } catch (err) {
      console.error("Failed to provision Matrix account:", err);
      errors.push("Matrix account: " + (err instanceof Error ? err.message : "unknown error"));
    }
  }

  if (errors.length > 0 && !nearProvisioned && !matrixProvisioned) {
    throw new Error(errors.join("; "));
  }

  return { nearProvisioned, matrixProvisioned, errors };
}

export async function fundAgentFromFaucet() {
  const user = await requireUser();

  const agent = await db.externalAgent.findUnique({
    where: { userId: user.id },
  });
  if (!agent) throw new Error("No agent connected");
  if (!agent.nearAccountId || !agent.nearEncryptedPrivateKey) {
    throw new Error("Agent does not have a NEAR wallet");
  }

  const result = await requestFaucetFunds({
    accountId: agent.nearAccountId,
    encryptedPrivateKey: agent.nearEncryptedPrivateKey,
  });

  return result;
}

export async function getAgentNearBalance() {
  const user = await requireUser();

  const agent = await db.externalAgent.findUnique({
    where: { userId: user.id },
  });
  if (!agent) throw new Error("No agent connected");
  if (!agent.nearAccountId) {
    throw new Error("Agent does not have a NEAR wallet");
  }

  return getNearBalance(agent.nearAccountId);
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
