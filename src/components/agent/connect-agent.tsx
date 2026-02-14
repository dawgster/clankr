"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Bot, Unplug, Wallet, MessageSquare, Wifi } from "lucide-react";
import {
  claimAgent,
  updateGateway,
  disconnectAgent,
  provisionAgentAccounts,
} from "@/lib/actions/agent";

type AgentInfo = {
  id: string;
  name: string;
  apiKeyPrefix: string;
  status: string;
  gatewayUrl: string | null;
  webhookEnabled: boolean;
  lastSeenAt: Date | null;
  createdAt: Date;
  nearAccountId: string | null;
  matrixUserId: string | null;
} | null;

export function ConnectAgent({ agent }: { agent: AgentInfo }) {
  const router = useRouter();
  const [claimToken, setClaimToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  // Gateway form state
  const [gatewayUrl, setGatewayUrl] = useState(agent?.gatewayUrl || "");
  const [gatewayToken, setGatewayToken] = useState("");
  const [webhookEnabled, setWebhookEnabled] = useState(
    agent?.webhookEnabled || false,
  );

  async function handleClaim(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await claimAgent(claimToken);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim agent");
    } finally {
      setLoading(false);
    }
  }

  async function handleGatewayUpdate(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await updateGateway({
        gatewayUrl: gatewayUrl || null,
        gatewayToken: gatewayToken || null,
        webhookEnabled,
      });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update gateway",
      );
    } finally {
      setLoading(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect your agent? It will no longer process events.")) {
      return;
    }
    setLoading(true);
    try {
      await disconnectAgent();
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to disconnect agent",
      );
    } finally {
      setLoading(false);
    }
  }

  // No agent connected — show claim form
  if (!agent) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            Connect Your Agent
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="mb-4 text-sm text-muted-foreground">
            Register an OpenClaw agent, then paste the claim token below to link
            it to your account.
          </p>
          <form onSubmit={handleClaim} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="claimToken">Claim Token</Label>
              <Input
                id="claimToken"
                value={claimToken}
                onChange={(e) => setClaimToken(e.target.value)}
                placeholder="clankr_claim_..."
                required
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Claiming..." : "Claim Agent"}
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  // Agent connected — show status + gateway config
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              {agent.name}
            </CardTitle>
            <Badge
              variant={agent.status === "ACTIVE" ? "default" : "secondary"}
            >
              {agent.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <p>
            <span className="text-muted-foreground">API Key:</span>{" "}
            {agent.apiKeyPrefix}...
          </p>
          {agent.lastSeenAt && (
            <p>
              <span className="text-muted-foreground">Last seen:</span>{" "}
              {new Date(agent.lastSeenAt).toLocaleString()}
            </p>
          )}
        </CardContent>
      </Card>

      <AgentAccountsCard agent={agent} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wifi className="h-4 w-4" />
            Gateway Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleGatewayUpdate} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gatewayUrl">Gateway URL</Label>
              <Input
                id="gatewayUrl"
                value={gatewayUrl}
                onChange={(e) => setGatewayUrl(e.target.value)}
                placeholder="https://your-agent.example.com"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gatewayToken">Gateway Token (optional)</Label>
              <Input
                id="gatewayToken"
                type="password"
                value={gatewayToken}
                onChange={(e) => setGatewayToken(e.target.value)}
                placeholder="Bearer token for webhook auth"
              />
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="webhookEnabled"
                checked={webhookEnabled}
                onCheckedChange={setWebhookEnabled}
              />
              <Label htmlFor="webhookEnabled">Enable webhook push</Label>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Gateway"}
              </Button>
              <Button
                type="button"
                variant="destructive"
                size="sm"
                onClick={handleDisconnect}
                disabled={loading}
              >
                <Unplug className="mr-1 h-4 w-4" />
                Disconnect
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function AgentAccountsCard({ agent }: { agent: NonNullable<AgentInfo> }) {
  const router = useRouter();
  const [provisioningNear, setProvisioningNear] = useState(false);
  const [provisioningMatrix, setProvisioningMatrix] = useState(false);
  const [error, setError] = useState("");

  async function handleProvisionNear() {
    setProvisioningNear(true);
    setError("");
    try {
      await provisionAgentAccounts({ near: true });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create NEAR wallet",
      );
    } finally {
      setProvisioningNear(false);
    }
  }

  async function handleProvisionMatrix() {
    setProvisioningMatrix(true);
    setError("");
    try {
      await provisionAgentAccounts({ matrix: true });
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Failed to create Matrix account",
      );
    } finally {
      setProvisioningMatrix(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4" />
          Agent Accounts
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">NEAR Wallet:</span>
            {agent.nearAccountId ? (
              <span className="font-mono text-xs">{agent.nearAccountId}</span>
            ) : (
              <span className="text-muted-foreground italic">
                Not provisioned
              </span>
            )}
          </div>
          {!agent.nearAccountId && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleProvisionNear}
              disabled={provisioningNear}
            >
              {provisioningNear ? "Creating..." : "Create NEAR Wallet"}
            </Button>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Matrix Account:</span>
            {agent.matrixUserId ? (
              <span className="font-mono text-xs">{agent.matrixUserId}</span>
            ) : (
              <span className="text-muted-foreground italic">
                Not provisioned
              </span>
            )}
          </div>
          {!agent.matrixUserId && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleProvisionMatrix}
              disabled={provisioningMatrix}
            >
              {provisioningMatrix ? "Creating..." : "Create Matrix Account"}
            </Button>
          )}
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </CardContent>
    </Card>
  );
}
