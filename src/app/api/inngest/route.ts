import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { evaluateConnection } from "@/inngest/functions/evaluate-connection";
import { dispatchAgentEvent } from "@/inngest/functions/dispatch-agent-event";
import { expireAgentEvents } from "@/inngest/functions/expire-agent-events";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    evaluateConnection,
    dispatchAgentEvent,
    expireAgentEvents,
  ],
});
