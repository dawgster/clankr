import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { evaluateConnection } from "@/inngest/functions/evaluate-connection";
import { negotiationTurn } from "@/inngest/functions/negotiation-turn";
import { dispatchAgentEvent } from "@/inngest/functions/dispatch-agent-event";
import { expireAgentEvents } from "@/inngest/functions/expire-agent-events";
import { processNegotiationTurn } from "@/inngest/functions/process-negotiation-turn";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    evaluateConnection,
    negotiationTurn,
    dispatchAgentEvent,
    expireAgentEvents,
    processNegotiationTurn,
  ],
});
