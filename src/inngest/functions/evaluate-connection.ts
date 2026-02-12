import { inngest } from "../client";
import { ensureAgentEventForRequest } from "@/lib/connection-events";

export const evaluateConnection = inngest.createFunction(
  { id: "evaluate-connection" },
  { event: "connection/request.created" },
  async ({ event, step }) => {
    const { requestId } = event.data;

    const outcome = await step.run("evaluate", async () => {
      return ensureAgentEventForRequest(requestId);
    });

    if (outcome.type === "event_created") {
      await inngest.send({
        name: "agent/event.created",
        data: { eventId: outcome.eventId },
      });
    }

    return outcome;
  },
);
