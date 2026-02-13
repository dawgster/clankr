import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMyAgent, getAgentEvents } from "@/lib/actions/agent";
import { ConnectAgent } from "@/components/agent/connect-agent";
import { AgentEventLog } from "@/components/agent/agent-event-log";

export const dynamic = "force-dynamic";

export default async function AgentPage() {
  const user = await requireUser();
  if (!user.profile) redirect("/onboarding");

  const agent = await getMyAgent();
  const events = agent ? await getAgentEvents() : [];

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Agent</h1>
        <p className="text-muted-foreground">
          Connect and manage your external agent to handle connection requests
          and messages.
        </p>
      </div>

      <ConnectAgent agent={agent} />

      {agent && <AgentEventLog events={events} />}
    </div>
  );
}
