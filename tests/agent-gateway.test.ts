import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent } from "./helpers/seed";

vi.mock("@clerk/nextjs/server", () => ({
  auth: vi.fn(),
}));

import { auth } from "@clerk/nextjs/server";
import { PUT as updateGateway } from "@/app/api/v1/agent/gateway/route";

describe("PUT /api/v1/agent/gateway", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("returns 401 when unauthenticated", async () => {
    vi.mocked(auth).mockResolvedValue({ userId: null } as any);

    const res = await updateGateway(
      new Request("http://localhost/api/v1/agent/gateway", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gatewayUrl: "https://agent.example.com",
          webhookEnabled: true,
        }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("returns 404 when user has no connected agent", async () => {
    const user = await createTestUser({ displayName: "No Agent Owner" });
    vi.mocked(auth).mockResolvedValue({ userId: user.clerkId } as any);

    const res = await updateGateway(
      new Request("http://localhost/api/v1/agent/gateway", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gatewayUrl: "https://agent.example.com",
          webhookEnabled: true,
        }),
      }),
    );

    expect(res.status).toBe(404);
    expect((await res.json()).error).toBe("No agent connected");
  });

  it("returns 400 for invalid body", async () => {
    const user = await createTestUser({ displayName: "Invalid Body Owner" });
    await createTestAgent(user.id, "Agent");
    vi.mocked(auth).mockResolvedValue({ userId: user.clerkId } as any);

    const res = await updateGateway(
      new Request("http://localhost/api/v1/agent/gateway", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gatewayUrl: "not-a-url",
          webhookEnabled: true,
        }),
      }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid input");
  });

  it("updates gateway config and can clear token", async () => {
    const user = await createTestUser({ displayName: "Gateway Owner" });
    const { agent } = await createTestAgent(user.id, "Gateway Agent");

    await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "https://old.example.com",
        gatewayToken: "old-token",
        webhookEnabled: true,
      },
    });

    vi.mocked(auth).mockResolvedValue({ userId: user.clerkId } as any);

    const res = await updateGateway(
      new Request("http://localhost/api/v1/agent/gateway", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          gatewayUrl: "https://new.example.com",
          webhookEnabled: false,
        }),
      }),
    );

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      id: agent.id,
      gatewayUrl: "https://new.example.com",
      webhookEnabled: false,
    });

    const updated = await db.externalAgent.findUnique({ where: { id: agent.id } });
    expect(updated!.gatewayUrl).toBe("https://new.example.com");
    expect(updated!.gatewayToken).toBeNull();
    expect(updated!.webhookEnabled).toBe(false);
  });
});
