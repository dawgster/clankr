import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent } from "./helpers/seed";

vi.mock("@/lib/embedding", () => ({
  generateEmbedding: vi.fn(),
}));

import { generateEmbedding } from "@/lib/embedding";
import { GET as discoverUsers } from "@/app/api/v1/agent/discover/route";

describe("GET /api/v1/agent/discover", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
    vi.restoreAllMocks();
  });

  it("returns 401 for missing authorization", async () => {
    const res = await discoverUsers(
      new NextRequest("http://localhost/api/v1/agent/discover"),
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 for unclaimed agent", async () => {
    const { key, hash, prefix } = await import("@/lib/agent-auth").then((m) =>
      m.generateApiKey(),
    );
    await db.externalAgent.create({
      data: {
        name: "Unclaimed Discover Agent",
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        status: "ACTIVE",
      },
    });

    const res = await discoverUsers(
      new NextRequest("http://localhost/api/v1/agent/discover", {
        headers: { Authorization: `Bearer ${key}` },
      }),
    );

    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Agent must be claimed to discover users");
  });

  it("uses embedding search when q is provided", async () => {
    const user = await createTestUser({ displayName: "Semantic Owner" });
    const { apiKey } = await createTestAgent(user.id, "Semantic Agent");
    await createTestUser({
      displayName: "AI Tooling Builder",
      bio: "Builds AI tooling",
      intent: "Looking for collaborators",
      interests: ["ai"],
    });

    vi.mocked(generateEmbedding).mockResolvedValue(new Array(1536).fill(0));

    const res = await discoverUsers(
      new NextRequest("http://localhost/api/v1/agent/discover?q=%20ai%20tooling%20", {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(generateEmbedding)).toHaveBeenCalledWith("ai tooling");
    const body = await res.json();
    expect(body.users.length).toBeGreaterThanOrEqual(1);
    expect(body.users.some((u: { displayName: string }) => u.displayName === "AI Tooling Builder")).toBe(true);
  });

  it("uses non-query fallback branch when q is blank", async () => {
    const user = await createTestUser({ displayName: "Fallback Owner" });
    const { apiKey } = await createTestAgent(user.id, "Fallback Agent");
    const candidate = await createTestUser({
      displayName: "Recent User",
      bio: "No embedding",
    });

    const res = await discoverUsers(
      new NextRequest("http://localhost/api/v1/agent/discover?q=%20%20%20", {
        headers: { Authorization: `Bearer ${apiKey}` },
      }),
    );

    expect(res.status).toBe(200);
    expect(vi.mocked(generateEmbedding)).not.toHaveBeenCalled();
    const body = await res.json();
    expect(body.users.some((u: { id: string }) => u.id === candidate.id)).toBe(
      true,
    );
  });
});
