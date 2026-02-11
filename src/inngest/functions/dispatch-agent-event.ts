import { inngest } from "../client";
import { db } from "@/lib/db";
import { dispatchWebhook } from "@/lib/webhook";

const MAX_RETRIES = 3;
const EXPIRY_HOURS = 24;

export const dispatchAgentEvent = inngest.createFunction(
  { id: "dispatch-agent-event" },
  { event: "agent/event.created" },
  async ({ event, step }) => {
    const { eventId } = event.data;

    // Try webhook delivery
    await step.run("deliver-webhook", async () => {
      const agentEvent = await db.agentEvent.findUnique({
        where: { id: eventId },
        include: { externalAgent: true },
      });

      if (!agentEvent || !agentEvent.externalAgent.webhookEnabled) return;

      let delivered = false;
      for (let attempt = 0; attempt < MAX_RETRIES && !delivered; attempt++) {
        delivered = await dispatchWebhook(agentEvent.externalAgent, agentEvent);
        if (!delivered && attempt < MAX_RETRIES - 1) {
          // Simple backoff: 1s, 2s, 4s
          await new Promise((r) => setTimeout(r, 1000 * Math.pow(2, attempt)));
        }
      }
    });

    // Schedule expiry check
    await step.sleep("wait-for-expiry", `${EXPIRY_HOURS}h`);

    await inngest.send({
      name: "agent/event.timeout",
      data: { eventId },
    });
  },
);
