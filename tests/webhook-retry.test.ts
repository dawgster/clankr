import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent, createTestAgentEvent } from "./helpers/seed";

// Mock only the Inngest client — NOT dispatchWebhook.
// This lets us call the handler directly while exercising the real
// dispatchWebhook → fetch → DB update path.
const inngestSendMock = vi.fn().mockResolvedValue(undefined);

vi.mock("@/inngest/client", () => ({
  inngest: {
    send: (...args: unknown[]) => inngestSendMock(...args),
    createFunction: vi.fn(
      (_config: unknown, _trigger: unknown, handler: (...args: unknown[]) => unknown) =>
        handler,
    ),
  },
}));

import { dispatchAgentEvent } from "@/inngest/functions/dispatch-agent-event";

function buildStep() {
  return {
    run: vi.fn(async (_name: string, fn: () => unknown) => fn()),
    sleep: vi.fn(async () => undefined),
  };
}

describe("Webhook Retry Integration", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    await cleanDatabase();
    vi.restoreAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("retries 3 times when all attempts fail, event stays PENDING", async () => {
    const user = await createTestUser({ displayName: "Retry All Fail" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://always-fails.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: updatedAgent.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-retry-all-fail" },
    });

    // All 3 attempts return 500
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("Internal Server Error", { status: 500 }),
    );

    const step = buildStep();
    await dispatchAgentEvent({
      event: { data: { eventId: event.id } },
      step,
    } as any);

    // dispatchWebhook should have been called 3 times (MAX_RETRIES)
    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    // Event should remain PENDING with 3 accumulated attempts
    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("PENDING");
    expect(updated!.webhookAttempts).toBe(3);
    expect(updated!.lastWebhookAt).not.toBeNull();
  });

  it("does not retry when first attempt succeeds", async () => {
    const user = await createTestUser({ displayName: "Retry First OK" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://first-ok.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: updatedAgent.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-first-ok" },
    });

    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response("OK", { status: 200 }),
    );

    const step = buildStep();
    await dispatchAgentEvent({
      event: { data: { eventId: event.id } },
      step,
    } as any);

    // Only 1 fetch call — no retries needed
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("DELIVERED");
    expect(updated!.webhookAttempts).toBe(1);
  });

  it("succeeds on second attempt after first failure", async () => {
    const user = await createTestUser({ displayName: "Retry Second OK" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://second-ok.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: updatedAgent.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-second-ok" },
    });

    // First call fails (500), second succeeds (200)
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response("Error", { status: 503 }))
      .mockResolvedValueOnce(new Response("OK", { status: 200 }));

    const step = buildStep();
    await dispatchAgentEvent({
      event: { data: { eventId: event.id } },
      step,
    } as any);

    // 2 calls: one failure + one success
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("DELIVERED");
    expect(updated!.webhookAttempts).toBe(2);
  });

  it("succeeds on third attempt after two failures", async () => {
    const user = await createTestUser({ displayName: "Retry Third OK" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://third-ok.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: updatedAgent.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-third-ok" },
    });

    // First two fail, third succeeds
    globalThis.fetch = vi.fn()
      .mockResolvedValueOnce(new Response("Error", { status: 500 }))
      .mockResolvedValueOnce(new Response("Error", { status: 502 }))
      .mockResolvedValueOnce(new Response("OK", { status: 200 }));

    const step = buildStep();
    await dispatchAgentEvent({
      event: { data: { eventId: event.id } },
      step,
    } as any);

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("DELIVERED");
    expect(updated!.webhookAttempts).toBe(3);
  });

  it("retries with network errors (fetch throws) and eventually succeeds", async () => {
    const user = await createTestUser({ displayName: "Net Retry" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://flaky-network.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: updatedAgent.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-net-retry" },
    });

    // First call: network error, second call: success
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(new Response("OK", { status: 200 }));

    const step = buildStep();
    await dispatchAgentEvent({
      event: { data: { eventId: event.id } },
      step,
    } as any);

    expect(globalThis.fetch).toHaveBeenCalledTimes(2);

    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("DELIVERED");
    expect(updated!.webhookAttempts).toBe(2);
  });

  it("skips webhook delivery when agent has webhookEnabled=false", async () => {
    const user = await createTestUser({ displayName: "Retry Disabled" });
    const { agent } = await createTestAgent(user.id);

    // webhookEnabled stays false (default)
    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-disabled" },
    });

    globalThis.fetch = vi.fn();

    const step = buildStep();
    await dispatchAgentEvent({
      event: { data: { eventId: event.id } },
      step,
    } as any);

    expect(globalThis.fetch).not.toHaveBeenCalled();

    // Event should remain untouched
    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("PENDING");
    expect(updated!.webhookAttempts).toBe(0);
  });

  it("handles missing event gracefully without calling fetch", async () => {
    globalThis.fetch = vi.fn();

    const step = buildStep();
    await dispatchAgentEvent({
      event: { data: { eventId: "nonexistent-event-id" } },
      step,
    } as any);

    expect(globalThis.fetch).not.toHaveBeenCalled();
    // Should still schedule expiry (the function continues past the step.run)
    expect(step.sleep).toHaveBeenCalledWith("wait-for-expiry", "24h");
  });

  it("mixes network errors and HTTP errors across retries", async () => {
    const user = await createTestUser({ displayName: "Mixed Errors" });
    const { agent } = await createTestAgent(user.id);

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://mixed-errors.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: updatedAgent.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-mixed" },
    });

    // attempt 1: network error, attempt 2: HTTP 500, attempt 3: HTTP 503
    globalThis.fetch = vi.fn()
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockResolvedValueOnce(new Response("Error", { status: 500 }))
      .mockResolvedValueOnce(new Response("Unavailable", { status: 503 }));

    const step = buildStep();
    await dispatchAgentEvent({
      event: { data: { eventId: event.id } },
      step,
    } as any);

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);

    const updated = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updated!.status).toBe("PENDING");
    expect(updated!.webhookAttempts).toBe(3);
  });
});
