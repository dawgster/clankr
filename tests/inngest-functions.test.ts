import { describe, it, expect, beforeEach, vi } from "vitest";
import { db } from "@/lib/db";
import { cleanDatabase } from "./helpers/setup";
import { createTestUser, createTestAgent, createTestAgentEvent } from "./helpers/seed";

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

const dispatchWebhookMock = vi.fn().mockResolvedValue(true);
vi.mock("@/lib/webhook", () => ({
  dispatchWebhook: (...args: unknown[]) => dispatchWebhookMock(...args),
}));

import { evaluateConnection } from "@/inngest/functions/evaluate-connection";
import { dispatchAgentEvent } from "@/inngest/functions/dispatch-agent-event";
import { expireAgentEvents } from "@/inngest/functions/expire-agent-events";

function buildStep() {
  return {
    run: vi.fn(async (_name: string, fn: () => unknown) => fn()),
    sleep: vi.fn(async () => undefined),
  };
}

describe("Inngest Functions — evaluate-connection", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("creates one event and conversation for active recipient agent; second run is idempotent", async () => {
    const fromUser = await createTestUser({ displayName: "From Eval" });
    const toUser = await createTestUser({ displayName: "To Eval" });
    const { agent: toAgent } = await createTestAgent(toUser.id, "To Agent");

    const request = await db.connectionRequest.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        category: "COLLABORATION",
        intent: "We should collaborate",
      },
    });

    const step1 = buildStep();
    const first = await evaluateConnection({
      event: { data: { requestId: request.id } },
      step: step1,
    } as any);

    const step2 = buildStep();
    const second = await evaluateConnection({
      event: { data: { requestId: request.id } },
      step: step2,
    } as any);

    expect(first.type).toBe("event_created");
    expect(second.type).toBe("event_exists");
    expect(step1.run).toHaveBeenCalledWith("evaluate", expect.any(Function));

    const events = await db.agentEvent.findMany({
      where: { connectionRequestId: request.id, externalAgentId: toAgent.id },
    });
    expect(events).toHaveLength(1);

    const conversations = await db.agentConversation.findMany({
      where: { connectionRequestId: request.id, externalAgentId: toAgent.id },
    });
    expect(conversations).toHaveLength(1);

    expect(inngestSendMock).toHaveBeenCalledTimes(1);
    expect(inngestSendMock).toHaveBeenCalledWith({
      name: "agent/event.created",
      data: { eventId: events[0].id },
    });
  });

  it("creates at most one notification when recipient has no active agent", async () => {
    const fromUser = await createTestUser({ displayName: "From No Agent" });
    const toUser = await createTestUser({ displayName: "To No Agent" });

    const request = await db.connectionRequest.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        intent: "Ping",
      },
    });

    await evaluateConnection({
      event: { data: { requestId: request.id } },
      step: buildStep(),
    } as any);
    await evaluateConnection({
      event: { data: { requestId: request.id } },
      step: buildStep(),
    } as any);

    const notifications = await db.notification.findMany({
      where: { userId: toUser.id, type: "CONNECTION_REQUEST" },
    });
    expect(notifications).toHaveLength(1);
    expect((notifications[0].metadata as Record<string, string>).requestId).toBe(
      request.id,
    );

    expect(inngestSendMock).not.toHaveBeenCalled();
  });
});

describe("Inngest Functions — dispatch-agent-event", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("dispatches webhook for eligible events, then schedules timeout event", async () => {
    const owner = await createTestUser({ displayName: "Dispatch Owner" });
    const { agent } = await createTestAgent(owner.id, "Dispatch Agent");

    const updatedAgent = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        gatewayUrl: "http://agent-gateway.test",
        webhookEnabled: true,
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: updatedAgent.id,
      type: "CONNECTION_REQUEST",
      payload: { requestId: "req-dispatch" },
    });

    const step = buildStep();
    await dispatchAgentEvent({
      event: { data: { eventId: event.id } },
      step,
    } as any);

    expect(step.run).toHaveBeenCalledWith("deliver-webhook", expect.any(Function));
    expect(dispatchWebhookMock).toHaveBeenCalledTimes(1);
    expect(step.sleep).toHaveBeenCalledWith("wait-for-expiry", "24h");
    expect(inngestSendMock).toHaveBeenCalledWith({
      name: "agent/event.timeout",
      data: { eventId: event.id },
    });
  });

  it("does not attempt webhook delivery when event does not exist", async () => {
    const step = buildStep();

    await dispatchAgentEvent({
      event: { data: { eventId: "missing-event-id" } },
      step,
    } as any);

    expect(dispatchWebhookMock).not.toHaveBeenCalled();
    expect(step.sleep).toHaveBeenCalledWith("wait-for-expiry", "24h");
    expect(inngestSendMock).toHaveBeenCalledWith({
      name: "agent/event.timeout",
      data: { eventId: "missing-event-id" },
    });
  });
});

describe("Inngest Functions — expire-agent-events", () => {
  beforeEach(async () => {
    await cleanDatabase();
    vi.clearAllMocks();
  });

  it("expires pending event once and notifies owner", async () => {
    const fromUser = await createTestUser({ displayName: "Expire From" });
    const toUser = await createTestUser({ displayName: "Expire To" });
    const { agent } = await createTestAgent(toUser.id, "Expire Agent");

    const request = await db.connectionRequest.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        intent: "Old request",
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      connectionRequestId: request.id,
      payload: { requestId: request.id },
      expiresInMs: -1000,
    });

    await expireAgentEvents({
      event: { data: { eventId: event.id } },
      step: buildStep(),
    } as any);
    await expireAgentEvents({
      event: { data: { eventId: event.id } },
      step: buildStep(),
    } as any);

    const updatedEvent = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updatedEvent!.status).toBe("EXPIRED");

    const notifications = await db.notification.findMany({
      where: { userId: toUser.id, type: "AGENT_DECISION" },
    });
    expect(notifications).toHaveLength(1);
  });

  it("expires DELIVERED events that were not decided", async () => {
    const fromUser = await createTestUser({ displayName: "Delivered From" });
    const toUser = await createTestUser({ displayName: "Delivered To" });
    const { agent } = await createTestAgent(toUser.id, "Delivered Agent");

    const request = await db.connectionRequest.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        intent: "Delivered but not decided",
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      connectionRequestId: request.id,
      payload: { requestId: request.id },
      expiresInMs: -1000,
    });

    // Simulate that the webhook was delivered but never decided
    await db.agentEvent.update({
      where: { id: event.id },
      data: { status: "DELIVERED", webhookAttempts: 1, lastWebhookAt: new Date() },
    });

    await expireAgentEvents({
      event: { data: { eventId: event.id } },
      step: buildStep(),
    } as any);

    const updatedEvent = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(updatedEvent!.status).toBe("EXPIRED");

    const notifications = await db.notification.findMany({
      where: { userId: toUser.id, type: "AGENT_DECISION" },
    });
    expect(notifications).toHaveLength(1);
  });

  it("creates notification with correct title, body, and metadata", async () => {
    const fromUser = await createTestUser({ displayName: "Notif From" });
    const toUser = await createTestUser({ displayName: "Notif To" });
    const { agent } = await createTestAgent(toUser.id, "Notif Agent");

    const request = await db.connectionRequest.create({
      data: {
        fromUserId: fromUser.id,
        toUserId: toUser.id,
        intent: "Check notification content",
      },
    });

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      connectionRequestId: request.id,
      payload: { requestId: request.id },
      expiresInMs: -1000,
    });

    await expireAgentEvents({
      event: { data: { eventId: event.id } },
      step: buildStep(),
    } as any);

    const notifications = await db.notification.findMany({
      where: { userId: toUser.id, type: "AGENT_DECISION" },
    });
    expect(notifications).toHaveLength(1);

    const notif = notifications[0];
    expect(notif.title).toBe("Agent event expired");
    expect(notif.body).toBe("A connection request event was not handled in time.");
    expect((notif.metadata as Record<string, string>).eventId).toBe(event.id);
    expect((notif.metadata as Record<string, string>).requestId).toBe(request.id);
  });

  it("does not modify decided events", async () => {
    const owner = await createTestUser({ displayName: "Decided Owner" });
    const { agent } = await createTestAgent(owner.id, "Decided Agent");

    const { event } = await createTestAgentEvent({
      agentId: agent.id,
      type: "CONNECTION_REQUEST",
      payload: { test: true },
    });

    await db.agentEvent.update({
      where: { id: event.id },
      data: { status: "DECIDED" },
    });

    await expireAgentEvents({
      event: { data: { eventId: event.id } },
      step: buildStep(),
    } as any);

    const check = await db.agentEvent.findUnique({ where: { id: event.id } });
    expect(check!.status).toBe("DECIDED");

    const notifications = await db.notification.findMany({
      where: { userId: owner.id, type: "AGENT_DECISION" },
    });
    expect(notifications).toHaveLength(0);
  });
});
