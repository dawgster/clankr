import { db } from "@/lib/db";
import { generateApiKey, hashApiKey } from "@/lib/agent-auth";

let userCounter = 0;

/**
 * Create a test user with a profile. Returns the user record along with
 * profile data. Each call increments a counter to guarantee unique emails,
 * usernames, and clerkIds.
 */
export async function createTestUser(overrides: {
  displayName?: string;
  bio?: string;
  interests?: string[];
  lookingFor?: string[];
  intent?: string;
} = {}) {
  const n = ++userCounter;
  const user = await db.user.create({
    data: {
      clerkId: `test_clerk_${n}_${Date.now()}`,
      email: `testuser${n}_${Date.now()}@test.local`,
      username: `testuser${n}_${Date.now()}`,
      profile: {
        create: {
          displayName: overrides.displayName ?? `Test User ${n}`,
          bio: overrides.bio ?? `Bio for test user ${n}`,
          interests: overrides.interests ?? ["testing", "integration"],
          lookingFor: overrides.lookingFor ?? ["collaborators"],
          intent: overrides.intent ?? `Looking to build cool things ${n}`,
        },
      },
    },
    include: { profile: true },
  });

  return user;
}

/**
 * Create an active agent attached to a user. Returns the agent record
 * plus the raw API key (which is not stored in the database).
 */
export async function createTestAgent(userId: string, name?: string) {
  const { key, hash, prefix } = generateApiKey();

  const agent = await db.externalAgent.create({
    data: {
      name: name ?? "Test Agent",
      apiKeyHash: hash,
      apiKeyPrefix: prefix,
      userId,
      status: "ACTIVE",
    },
  });

  return { agent, apiKey: key };
}

/**
 * Create a listing owned by a seller user.
 */
export async function createTestListing(sellerId: string, overrides: {
  title?: string;
  description?: string;
  price?: number;
} = {}) {
  return db.listing.create({
    data: {
      sellerId,
      title: overrides.title ?? "Test Listing",
      description: overrides.description ?? "A test listing for integration tests",
      price: overrides.price ?? 100,
    },
  });
}

/**
 * Create a negotiation between buyer and seller on a listing.
 */
export async function createTestNegotiation(
  listingId: string,
  buyerId: string,
  sellerId: string,
  offerPrice: number = 80,
) {
  return db.negotiation.create({
    data: {
      listingId,
      buyerId,
      sellerId,
      offerPrice,
    },
  });
}

/**
 * Create an agent event (e.g. CONNECTION_REQUEST) ready for an agent to poll.
 */
export async function createTestAgentEvent(opts: {
  agentId: string;
  type: "CONNECTION_REQUEST" | "NEGOTIATION_OFFER" | "NEGOTIATION_TURN";
  connectionRequestId?: string;
  negotiationId?: string;
  payload?: Record<string, unknown>;
  expiresInMs?: number;
}) {
  const conversation = await db.agentConversation.create({
    data: {
      externalAgentId: opts.agentId,
      connectionRequestId: opts.connectionRequestId,
      negotiationId: opts.negotiationId,
      status: "ACTIVE",
    },
  });

  const event = await db.agentEvent.create({
    data: {
      externalAgentId: opts.agentId,
      type: opts.type,
      connectionRequestId: opts.connectionRequestId,
      negotiationId: opts.negotiationId,
      conversationId: conversation.id,
      payload: opts.payload ?? { test: true },
      expiresAt: new Date(Date.now() + (opts.expiresInMs ?? 24 * 60 * 60 * 1000)),
    },
  });

  return { event, conversation };
}

/**
 * Build a NextRequest-compatible object with an Authorization header.
 */
export function buildAgentRequest(
  url: string,
  apiKey: string,
  options: RequestInit = {},
): Request {
  return new Request(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      ...(options.headers ?? {}),
    },
  });
}
