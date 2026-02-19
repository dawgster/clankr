import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent, createTestAgentEvent } from "./helpers/seed";
import { dispatchWebhook } from "@/lib/webhook";

describe("Webhook Dispatch", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await cleanDatabase();
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should deliver webhook to agent gateway and mark event as DELIVERED", async () => {
    const user = await createTestUser({ displayName: "Hook User" });
    const { agent } = await createTestAgent(user.id);

    // Enable webhooks on the agent
    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://agent-gateway.test",
        gatewayToken: "secret-token",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-123" },
    });

    // Mock fetch to simulate successful webhook delivery
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    );

    const result = await dispatchWebhook(updatedAgent, event);
    expect(result).toBe(true);

    // Verify fetch was called with correct URL and payload
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://agent-gateway.test/hooks/agent");
    expect(opts.method).toBe("POST");
    expect(opts.headers["Authorization"]).toBe("Bearer secret-token");
    expect(opts.headers["Content-Type"]).toBe("application/json");

    const body = JSON.parse(opts.body);
    expect(body.eventId).toBe(event.id);
    expect(body.type).toBe("CONNECTION_REQUEST");
    expect(body.callbackUrl).toContain(`/api/v1/agent/events/${event.id}/decide`);
    expect(body.expiresAt).toBeDefined();

    // Verify event was updated in DB
    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("DELIVERED");
    expect(updated!.webhookAttempts).toBe(1);
    expect(updated!.lastWebhookAt).not.toBeNull();
  });

  it("should return false and increment attempts on failed delivery", async () => {
    const user = await createTestUser({ displayName: "Fail Hook" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://failing-gateway.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    // Mock fetch to simulate 500 error
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const result = await dispatchWebhook(updatedAgent, event);
    expect(result).toBe(false);

    // Event should NOT be marked DELIVERED, but attempts should increment
    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("PENDING");
    expect(updated!.webhookAttempts).toBe(1);
    expect(updated!.lastWebhookAt).not.toBeNull();
  });

  it("should return false and increment attempts on network error", async () => {
    const user = await createTestUser({ displayName: "Net Fail" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://unreachable.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    // Mock fetch to throw network error
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("fetch failed"));

    const result = await dispatchWebhook(updatedAgent, event);
    expect(result).toBe(false);

    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("PENDING");
    expect(updated!.webhookAttempts).toBe(1);
  });

  it("should skip delivery when webhookEnabled is false", async () => {
    const user = await createTestUser({ displayName: "Disabled Hook" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://agent.test",
        webhookEnabled: false,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    globalThis.fetch = vi.fn();

    const result = await dispatchWebhook(updatedAgent, event);
    expect(result).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("should skip delivery when gatewayUrl is null", async () => {
    const user = await createTestUser({ displayName: "No Gateway" });
    const { agent } = await createTestAgent(user.id);

    // Agent has no gatewayUrl (default)
    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    globalThis.fetch = vi.fn();

    const result = await dispatchWebhook(agent, event);
    expect(result).toBe(false);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("should not include Authorization header when gatewayToken is null", async () => {
    const user = await createTestUser({ displayName: "No Token" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://no-token-gateway.test",
        webhookEnabled: true,
        gatewayToken: null,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("OK", { status: 200 }),
    );

    await dispatchWebhook(updatedAgent, event);

    const [, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(opts.headers["Authorization"]).toBeUndefined();
  });

  it("should handle fetch abort (timeout) as a failed delivery", async () => {
    const user = await createTestUser({ displayName: "Timeout User" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://slow-gateway.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    // Simulate AbortController timeout (DOMException with AbortError)
    globalThis.fetch = vi.fn().mockRejectedValue(
      new DOMException("The operation was aborted", "AbortError"),
    );

    const result = await dispatchWebhook(updatedAgent, event);
    expect(result).toBe(false);

    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("PENDING");
    expect(updated!.webhookAttempts).toBe(1);
    expect(updated!.lastWebhookAt).not.toBeNull();
  });

  it("should treat HTTP 4xx responses as failed delivery", async () => {
    const user = await createTestUser({ displayName: "4xx User" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://client-error-gateway.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    // Mock 404 response
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Not Found", { status: 404 }),
    );

    const result = await dispatchWebhook(updatedAgent, event);
    expect(result).toBe(false);

    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("PENDING");
    expect(updated!.webhookAttempts).toBe(1);
  });

  it("should dispatch NEW_MESSAGE events with correct type in payload", async () => {
    const user = await createTestUser({ displayName: "Msg Hook User" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://msg-gateway.test",
        gatewayToken: "msg-token",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "NEW_MESSAGE",
      payload: { threadId: "thread-123", content: "Hello from agent" },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("OK", { status: 200 }),
    );

    const result = await dispatchWebhook(updatedAgent, event);
    expect(result).toBe(true);

    const [, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.type).toBe("NEW_MESSAGE");
    expect(body.payload).toEqual({ threadId: "thread-123", content: "Hello from agent" });
    expect(body.eventId).toBe(event.id);
    expect(body.callbackUrl).toContain(`/api/v1/agent/events/${event.id}/decide`);

    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("DELIVERED");
  });

  it("should send exact expected payload structure", async () => {
    const user = await createTestUser({ displayName: "Payload User" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://payload-gateway.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-456", fromUser: { name: "Alice" } },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("OK", { status: 200 }),
    );

    await dispatchWebhook(updatedAgent, event);

    const [url, opts] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("http://payload-gateway.test/hooks/agent");
    expect(opts.method).toBe("POST");
    expect(opts.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(opts.body);
    expect(body).toEqual({
      eventId: event.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-456", fromUser: { name: "Alice" } },
      callbackUrl: `http://localhost:3000/api/v1/agent/events/${event.id}/decide`,
      expiresAt: event.expiresAt.toISOString(),
    });
  });

  it("should accumulate webhookAttempts across multiple calls", async () => {
    const user = await createTestUser({ displayName: "Multi Attempt" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://flaky-gateway.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    // First attempt fails
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Error", { status: 503 }),
    );
    await dispatchWebhook(updatedAgent, event);

    // Second attempt fails
    await dispatchWebhook(updatedAgent, event);

    // Third attempt succeeds
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("OK", { status: 200 }),
    );
    await dispatchWebhook(updatedAgent, event);

    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.webhookAttempts).toBe(3);
    expect(updated!.status).toBe("DELIVERED");
  });
});
