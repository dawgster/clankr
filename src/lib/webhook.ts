import type { ExternalAgent, AgentEvent } from "@/generated/prisma/client";
import { db } from "./db";

const WEBHOOK_TIMEOUT_MS = 10_000;

export async function dispatchWebhook(
  agent: ExternalAgent,
  event: AgentEvent,
) {
  if (!agent.gatewayUrl || !agent.webhookEnabled) return false;

  const callbackUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/v1/agent/events/${event.id}/decide`;

  const payload = {
    eventId: event.id,
    type: event.type,
    payload: event.payload,
    callbackUrl,
    expiresAt: event.expiresAt.toISOString(),
  };

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

    const res = await fetch(`${agent.gatewayUrl}/hooks/agent`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(agent.gatewayToken
          ? { Authorization: `Bearer ${agent.gatewayToken}` }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    clearTimeout(timeout);

    await db.agentEvent.update({
      where: { id: event.id },
      data: {
        webhookAttempts: { increment: 1 },
        lastWebhookAt: new Date(),
        status: res.ok ? "DELIVERED" : event.status,
      },
    });

    return res.ok;
  } catch {
    await db.agentEvent.update({
      where: { id: event.id },
      data: {
        webhookAttempts: { increment: 1 },
        lastWebhookAt: new Date(),
      },
    });
    return false;
  }
}
