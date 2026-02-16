import { db } from "@/lib/db";
import { generateApiKey } from "@/lib/agent-auth";
import { createNearSubAccount } from "@/lib/near/account";
import { transferNear } from "@/lib/near/transfer";
import crypto from "crypto";

const DEMO_SELLER = {
  clerkId: "demo_drinks_vendor",
  email: "drinks@demo.clankr.xyz",
  username: "drinks-vendor",
  displayName: "Drinks Vendor",
  bio: "Local drinks vendor. Cold beverages, juices, and bottled water available for delivery.",
  intent: "Selling drinks, bottled water, juices, and cold beverages",
  agentName: "DrinksBot",
};

const NEGOTIATION_SCRIPT: Array<{
  role: "USER" | "AGENT";
  content: string;
  delayMs: number;
}> = [
  {
    role: "USER",
    content:
      "Hi! I saw you\u2019re looking for a bottle. I\u2019ve got a fresh full bottle of cold-pressed juice \u2014 perfect for this weather. I\u2019m selling it for 2.5 NEAR.",
    delayMs: 3000,
  },
  {
    role: "AGENT",
    content:
      "That sounds refreshing! My client is definitely interested. But 2.5 NEAR is a bit steep for a single bottle. How about 2.0 NEAR?",
    delayMs: 4000,
  },
  {
    role: "USER",
    content:
      "2.0 is a bit low \u2014 this is premium cold-pressed, not your regular store-bought stuff. Could you do 2.3 NEAR?",
    delayMs: 4500,
  },
  {
    role: "AGENT",
    content:
      "Fair point on the quality. Let\u2019s meet closer to the middle \u2014 how about 2.05 NEAR?",
    delayMs: 4000,
  },
  {
    role: "USER",
    content:
      "Tell you what \u2014 I\u2019ve got another buyer interested, but I\u2019d rather close this quickly. Let\u2019s settle at 2.1 NEAR and we have a deal.",
    delayMs: 4000,
  },
  {
    role: "AGENT",
    content:
      "2.1 NEAR works for us \u2014 deal! Processing the payment now.",
    delayMs: 3500,
  },
];

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function ensureDemoSeller(): Promise<{
  userId: string;
  agentId: string;
  nearAccountId: string | null;
}> {
  let user = await db.user.findUnique({
    where: { clerkId: DEMO_SELLER.clerkId },
    include: { externalAgent: true, profile: true },
  });

  if (!user) {
    user = await db.user.create({
      data: {
        clerkId: DEMO_SELLER.clerkId,
        email: DEMO_SELLER.email,
        username: DEMO_SELLER.username,
        profile: {
          create: {
            displayName: DEMO_SELLER.displayName,
            bio: DEMO_SELLER.bio,
            intent: DEMO_SELLER.intent,
          },
        },
      },
      include: { externalAgent: true, profile: true },
    });
  }

  if (!user.profile) {
    await db.profile.create({
      data: {
        userId: user.id,
        displayName: DEMO_SELLER.displayName,
        bio: DEMO_SELLER.bio,
        intent: DEMO_SELLER.intent,
      },
    });
  }

  let agent = user.externalAgent;
  if (!agent) {
    const { hash, prefix } = generateApiKey();
    agent = await db.externalAgent.create({
      data: {
        name: DEMO_SELLER.agentName,
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        userId: user.id,
        status: "ACTIVE",
      },
    });
  }

  if (!agent.nearAccountId) {
    try {
      const nearAccount = await createNearSubAccount(agent.id);
      agent = await db.externalAgent.update({
        where: { id: agent.id },
        data: {
          nearAccountId: nearAccount.accountId,
          nearPublicKey: nearAccount.publicKey,
          nearEncryptedPrivateKey: nearAccount.encryptedPrivateKey,
        },
      });
    } catch (err) {
      console.error("Failed to provision NEAR account for demo seller:", err);
    }
  }

  return {
    userId: user.id,
    agentId: agent.id,
    nearAccountId: agent.nearAccountId,
  };
}

async function ensureConnection(userAId: string, userBId: string) {
  const existing = await db.connection.findFirst({
    where: {
      OR: [
        { userAId, userBId },
        { userAId: userBId, userBId: userAId },
      ],
    },
  });

  if (!existing) {
    await db.connection.create({
      data: { userAId, userBId },
    });
  }
}

export async function startScriptedNegotiation(buyerUserId: string): Promise<{
  conversationId: string;
}> {
  const buyerAgent = await db.externalAgent.findFirst({
    where: { userId: buyerUserId, status: "ACTIVE" },
  });

  if (!buyerAgent) {
    throw new Error("You need an active agent to start a negotiation");
  }

  if (!buyerAgent.nearAccountId || !buyerAgent.nearEncryptedPrivateKey) {
    throw new Error("Your agent needs a NEAR wallet to negotiate");
  }

  const seller = await ensureDemoSeller();

  await ensureConnection(buyerUserId, seller.userId);

  const chatThreadId = crypto.randomUUID();

  // Create buyer's conversation
  const buyerConversation = await db.agentConversation.create({
    data: {
      externalAgentId: buyerAgent.id,
      chatThreadId,
      peerUserId: seller.userId,
      status: "ACTIVE",
    },
  });

  // Create seller's conversation (so it shows on both sides)
  await db.agentConversation.create({
    data: {
      externalAgentId: seller.agentId,
      chatThreadId,
      peerUserId: buyerUserId,
      status: "ACTIVE",
    },
  });

  // Insert an initial system message immediately
  await db.agentMessage.create({
    data: {
      conversationId: buyerConversation.id,
      role: "SYSTEM",
      content:
        "Your agent found a match for your bottle intent. Starting negotiation with Drinks Vendor\u2019s agent\u2026",
    },
  });

  // Run the script in the background (fire-and-forget)
  runNegotiationScript(
    buyerConversation.id,
    buyerAgent.nearAccountId,
    buyerAgent.nearEncryptedPrivateKey,
    seller.nearAccountId,
  ).catch((err) => {
    console.error("Scripted negotiation failed:", err);
  });

  return { conversationId: buyerConversation.id };
}

async function runNegotiationScript(
  conversationId: string,
  buyerNearAccountId: string,
  buyerNearEncryptedPrivateKey: string,
  sellerNearAccountId: string | null,
) {
  for (const line of NEGOTIATION_SCRIPT) {
    await sleep(line.delayMs);

    await db.agentMessage.create({
      data: {
        conversationId,
        role: line.role,
        content: line.content,
      },
    });

    await db.agentConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });
  }

  // Execute the real NEAR transfer
  await sleep(2500);

  if (sellerNearAccountId) {
    try {
      const result = await transferNear({
        senderAccountId: buyerNearAccountId,
        senderEncryptedPrivateKey: buyerNearEncryptedPrivateKey,
        receiverAccountId: sellerNearAccountId,
        amount: "2.1",
      });

      const networkId = process.env.NEAR_NETWORK_ID || "testnet";
      const explorerBase =
        networkId === "mainnet"
          ? "https://nearblocks.io"
          : "https://testnet.nearblocks.io";

      await db.agentMessage.create({
        data: {
          conversationId,
          role: "SYSTEM",
          content: `Payment of 2.1 NEAR sent successfully.\n\nTransaction: ${result.transactionHash}\nFrom: ${result.senderAccountId}\nTo: ${result.receiverAccountId}\n\nView on explorer: ${explorerBase}/txns/${result.transactionHash}`,
        },
      });

      await sleep(2000);

      await db.agentMessage.create({
        data: {
          conversationId,
          role: "AGENT",
          content:
            "I just bought you a bottle of coke for 2.1 NEAR. Enjoy!",
        },
      });
    } catch (err) {
      console.error("NEAR transfer failed:", err);
      await db.agentMessage.create({
        data: {
          conversationId,
          role: "SYSTEM",
          content: `Payment failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        },
      });
    }
  } else {
    await db.agentMessage.create({
      data: {
        conversationId,
        role: "SYSTEM",
        content:
          "Payment skipped: Seller does not have a NEAR account configured.",
      },
    });
  }

  await db.agentConversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });
}
