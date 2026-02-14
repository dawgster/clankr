import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent } from "./helpers/seed";

vi.mock("@/inngest/client", () => ({
  inngest: { send: vi.fn().mockResolvedValue(undefined) },
}));

vi.mock("@/lib/agent-chat", () => ({
  sendAgentChatMessage: vi.fn(),
}));

import { inngest } from "@/inngest/client";
import { sendAgentChatMessage } from "@/lib/agent-chat";
import { POST as agentMessage } from "@/app/api/v1/agent/message/route";

describe("POST /api/v1/agent/message", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("returns 401 without auth header", async () => {
    const res = await agentMessage(
      new NextRequest("http://localhost/api/v1/agent/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: "x", content: "hi" }),
      }),
    );

    expect(res.status).toBe(401);
  });

  it("returns 403 for unclaimed agent", async () => {
    const { key, hash, prefix } = await import("@/lib/agent-auth").then((m) =>
      m.generateApiKey(),
    );
    await db.externalAgent.create({
      data: {
        name: "Unclaimed Agent",
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        status: "ACTIVE",
      },
    });

    const res = await agentMessage(
      new NextRequest("http://localhost/api/v1/agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify({ userId: "any-target", content: "hello" }),
      }),
    );

    expect(res.status).toBe(403);
    expect(vi.mocked(sendAgentChatMessage)).not.toHaveBeenCalled();
  });

  it("returns 400 on self-message attempt", async () => {
    const user = await createTestUser({ displayName: "Self Sender" });
    const { apiKey } = await createTestAgent(user.id, "Self Agent");

    const res = await agentMessage(
      new NextRequest("http://localhost/api/v1/agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ userId: user.id, content: "hello me" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(vi.mocked(sendAgentChatMessage)).not.toHaveBeenCalled();
  });

  it("returns 403 when users are not connected", async () => {
    const sender = await createTestUser({ displayName: "Sender" });
    const target = await createTestUser({ displayName: "Target" });
    const { apiKey } = await createTestAgent(sender.id, "Sender Agent");

    const res = await agentMessage(
      new NextRequest("http://localhost/api/v1/agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ userId: target.id, content: "hello target" }),
      }),
    );

    expect(res.status).toBe(403);
    expect(vi.mocked(sendAgentChatMessage)).not.toHaveBeenCalled();
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
  });

  it("returns 422 when target has no active agent", async () => {
    const sender = await createTestUser({ displayName: "Sender 422" });
    const target = await createTestUser({ displayName: "Target 422" });
    const { agent, apiKey } = await createTestAgent(sender.id, "Sender Agent");

    await db.connection.create({
      data: { userAId: sender.id, userBId: target.id },
    });

    vi.mocked(sendAgentChatMessage).mockResolvedValue(null);

    const res = await agentMessage(
      new NextRequest("http://localhost/api/v1/agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ userId: target.id, content: "hello target" }),
      }),
    );

    expect(res.status).toBe(422);
    expect(vi.mocked(sendAgentChatMessage)).toHaveBeenCalledWith(
      { id: agent.id, userId: sender.id },
      target.id,
      "hello target",
    );
    expect(vi.mocked(inngest.send)).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const sender = await createTestUser({ displayName: "Invalid Sender" });
    const { apiKey } = await createTestAgent(sender.id, "Invalid Agent");

    const res = await agentMessage(
      new NextRequest("http://localhost/api/v1/agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ userId: "", content: "" }),
      }),
    );

    expect(res.status).toBe(400);
    expect(vi.mocked(sendAgentChatMessage)).not.toHaveBeenCalled();
  });

  it("sends message, returns ids, and triggers webhook event dispatch", async () => {
    const sender = await createTestUser({ displayName: "Sender OK" });
    const target = await createTestUser({ displayName: "Target OK" });
    const { agent, apiKey } = await createTestAgent(sender.id, "Sender Agent");

    await db.connection.create({
      data: { userAId: sender.id, userBId: target.id },
    });

    vi.mocked(sendAgentChatMessage).mockResolvedValue({
      eventId: "evt-123",
      chatThreadId: "thread-123",
    });

    const res = await agentMessage(
      new NextRequest("http://localhost/api/v1/agent/message", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          userId: target.id,
          content: "can we collaborate on AI infra?",
        }),
      }),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      ok: true,
      eventId: "evt-123",
      chatThreadId: "thread-123",
    });

    expect(vi.mocked(sendAgentChatMessage)).toHaveBeenCalledWith(
      { id: agent.id, userId: sender.id },
      target.id,
      "can we collaborate on AI infra?",
    );
    expect(vi.mocked(inngest.send)).toHaveBeenCalledWith({
      name: "agent/event.created",
      data: { eventId: "evt-123" },
    });
  });
});
