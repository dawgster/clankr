import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser } from "./helpers/seed";
import { hashApiKey, validateApiKeyFormat } from "@/lib/agent-auth";

// Mock Clerk auth for the claim route
vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

// Mock NEAR account creation
vi.mock("@/lib/near/account", () => ({
  createNearSubAccount: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { createNearSubAccount } from "@/lib/near/account";
import { POST as registerAgent } from "@/app/api/v1/agents/register/route";
import { POST as claimAgent } from "@/app/api/v1/agents/claim/route";

describe("Agent Registration & Claiming", () => {
  let nearCallCount: number;
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
    nearCallCount = 0;
    vi.mocked(createNearSubAccount).mockImplementation(async () => {
      nearCallCount++;
      const suffix = `${Date.now()}-${nearCallCount}`;
      return {
        accountId: `a-${suffix}.clankr.testnet`,
        publicKey: `ed25519:FakePublicKey${suffix}`,
        encryptedPrivateKey: `encrypted-key-data-${suffix}`,
      };
    });
  });

  describe("POST /api/v1/agents/register", () => {
    it("should register a new agent and return apiKey + claimToken", async () => {
      const req = new Request("http://localhost/api/v1/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "My Agent" }),
      });

      const res = await registerAgent(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.apiKey).toBeDefined();
      expect(body.claimToken).toBeDefined();
      expect(body.nearAccountId).toMatch(/^a-.+\.clankr\.testnet$/);
      expect(body.apiKey).toMatch(/^clankr_/);
      expect(body.claimToken).toMatch(/^clankr_claim_/);

      // Verify the agent exists in the DB
      const hash = hashApiKey(body.apiKey);
      const agent = await db.externalAgent.findUnique({
        where: { apiKeyHash: hash },
      });
      expect(agent).not.toBeNull();
      expect(agent!.name).toBe("My Agent");
      expect(agent!.status).toBe("UNCLAIMED");
      expect(agent!.claimToken).toBe(body.claimToken);
    });

    it("should return 400 for invalid input (missing name)", async () => {
      const req = new Request("http://localhost/api/v1/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      const res = await registerAgent(req);
      expect(res.status).toBe(400);
    });

    it("should generate valid API key format", async () => {
      const req = new Request("http://localhost/api/v1/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Format Test Agent" }),
      });

      const res = await registerAgent(req);
      const body = await res.json();
      expect(validateApiKeyFormat(body.apiKey)).toBe(true);
    });

    it("should succeed even if NEAR account creation fails", async () => {
      vi.mocked(createNearSubAccount).mockRejectedValue(
        new Error("NEAR RPC unavailable"),
      );

      const req = new Request("http://localhost/api/v1/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "NEAR Fail Agent" }),
      });

      const res = await registerAgent(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.apiKey).toBeDefined();
      expect(body.claimToken).toBeDefined();
      expect(body.nearAccountId).toBeNull();
      expect(body.warning).toMatch(/NEAR account creation failed/);

      // Agent should still exist in DB
      const hash = hashApiKey(body.apiKey);
      const agent = await db.externalAgent.findUnique({
        where: { apiKeyHash: hash },
      });
      expect(agent).not.toBeNull();
      expect(agent!.nearAccountId).toBeNull();
    });
  });

  describe("POST /api/v1/agents/claim", () => {
    it("should claim an unclaimed agent for an authenticated user", async () => {
      const user = await createTestUser({ displayName: "Claimer" });

      // Register an agent first
      const regReq = new Request("http://localhost/api/v1/agents/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "Agent to Claim" }),
      });
      const regRes = await registerAgent(regReq);
      const { apiKey, claimToken } = await regRes.json();

      // Mock Clerk auth to return this user's clerkId
      vi.mocked(auth).mockResolvedValue({ userId: user.clerkId } as any);

      const claimReq = new Request("http://localhost/api/v1/agents/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimToken }),
      });

      const claimRes = await claimAgent(claimReq);
      expect(claimRes.status).toBe(200);

      const claimBody = await claimRes.json();
      expect(claimBody.name).toBe("Agent to Claim");
      expect(claimBody.status).toBe("ACTIVE");

      // Verify in DB
      const hash = hashApiKey(apiKey);
      const agent = await db.externalAgent.findUnique({
        where: { apiKeyHash: hash },
      });
      expect(agent!.status).toBe("ACTIVE");
      expect(agent!.userId).toBe(user.id);
      expect(agent!.claimToken).toBeNull();
    });

    it("should return 401 for unauthenticated user", async () => {
      vi.mocked(auth).mockResolvedValue({ userId: null } as any);

      const claimReq = new Request("http://localhost/api/v1/agents/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ claimToken: "clankr_claim_fake" }),
      });

      const res = await claimAgent(claimReq);
      expect(res.status).toBe(401);
    });

    it("should return 409 if user already has an agent", async () => {
      const user = await createTestUser({ displayName: "Has Agent" });

      // Register and claim first agent
      const reg1 = await registerAgent(
        new Request("http://localhost/api/v1/agents/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Agent 1" }),
        }),
      );
      const { claimToken: token1 } = await reg1.json();

      vi.mocked(auth).mockResolvedValue({ userId: user.clerkId } as any);
      await claimAgent(
        new Request("http://localhost/api/v1/agents/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimToken: token1 }),
        }),
      );

      // Try to claim a second agent
      const reg2 = await registerAgent(
        new Request("http://localhost/api/v1/agents/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: "Agent 2" }),
        }),
      );
      const { claimToken: token2 } = await reg2.json();

      const res = await claimAgent(
        new Request("http://localhost/api/v1/agents/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimToken: token2 }),
        }),
      );
      expect(res.status).toBe(409);
    });

    it("should return 404 for invalid claim token", async () => {
      const user = await createTestUser({ displayName: "Token Fail" });
      vi.mocked(auth).mockResolvedValue({ userId: user.clerkId } as any);

      const res = await claimAgent(
        new Request("http://localhost/api/v1/agents/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ claimToken: "clankr_claim_doesnotexist" }),
        }),
      );
      expect(res.status).toBe(404);
    });
  });
});
