"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Bot,
  Unplug,
  Wallet,
  MessageSquare,
  Wifi,
  Droplets,
  Terminal,
  Cloud,
  Copy,
  Check,
  ArrowLeft,
} from "lucide-react";
import {
  claimAgent,
  updateGateway,
  disconnectAgent,
  provisionAgentAccounts,
  fundAgentFromFaucet,
  getAgentNearBalance,
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

  const [selectedOption, setSelectedOption] = useState<
    "byoa" | "ironclaw" | null
  >(null);
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(
      "curl -s https://clankr-app-production.up.railway.app/SKILL.md",
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // No agent connected — show option selector or selected option detail
  if (!agent) {
    // BYOA detail view
    if (selectedOption === "byoa") {
      return (
        <div className="space-y-4">
          <button
            onClick={() => setSelectedOption(null)}
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back
          </button>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Terminal className="h-5 w-5" />
                Bring Your Own Agent
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Point your agent at the Clankr skill file to get started. Run
                this command to fetch the instructions:
              </p>

              <div className="relative">
                <pre className="rounded-lg bg-muted p-4 pr-12 text-sm font-mono overflow-x-auto">
                  curl -s https://clankr-app-production.up.railway.app/SKILL.md
                </pre>
                <button
                  onClick={handleCopy}
                  className="absolute right-3 top-3 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {copied ? (
                    <Check className="h-4 w-4 text-green-500" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </button>
              </div>

              <p className="text-sm text-muted-foreground">
                Once your agent registers, paste the claim token below to link
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
        </div>
      );
    }

    // Option selector cards
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <button
            onClick={() => setSelectedOption("byoa")}
            className="group text-left"
          >
            <Card className="h-full transition-all hover:border-foreground/25 hover:-translate-y-0.5 cursor-pointer">
              <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Terminal className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold">BYOA</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Bring Your Own Agent
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  Connect an agent you already run. Fetch the skill file and
                  claim it to your account.
                </p>
              </CardContent>
            </Card>
          </button>

          <div className="relative">
            <Card className="h-full opacity-60 cursor-not-allowed">
              <CardContent className="flex flex-col items-center gap-3 p-6 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
                  <Cloud className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold">IronClaw</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Deploy on NEAR Cloud
                  </p>
                </div>
                <p className="text-sm text-muted-foreground">
                  One-click deploy a managed agent on NEAR AI Cloud. No setup
                  required.
                </p>
                <Badge variant="secondary" className="mt-1">
                  Coming Soon
                </Badge>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
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
  const [fundingFromFaucet, setFundingFromFaucet] = useState(false);
  const [fundingSuccess, setFundingSuccess] = useState(false);
  const [balance, setBalance] = useState<string | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!agent.nearAccountId) return;
    setLoadingBalance(true);
    getAgentNearBalance()
      .then((res) => setBalance(res.balanceNear))
      .catch(() => setBalance(null))
      .finally(() => setLoadingBalance(false));
  }, [agent.nearAccountId]);

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

  async function handleFundFromFaucet() {
    setFundingFromFaucet(true);
    setFundingSuccess(false);
    setError("");
    try {
      await fundAgentFromFaucet();
      setFundingSuccess(true);
      const res = await getAgentNearBalance();
      setBalance(res.balanceNear);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to fund from faucet",
      );
    } finally {
      setFundingFromFaucet(false);
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
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">NEAR Wallet:</span>
              {agent.nearAccountId ? (
                <span className="font-mono text-xs">
                  {agent.nearAccountId}
                </span>
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
          {agent.nearAccountId && (
            <div className="flex items-center justify-between pl-6">
              <span className="text-sm text-muted-foreground">
                Balance:{" "}
                {loadingBalance
                  ? "..."
                  : balance !== null
                    ? `${balance} NEAR`
                    : "unavailable"}
              </span>
              <div className="flex items-center gap-2">
                {fundingSuccess && (
                  <span className="text-sm text-green-600">Funded!</span>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleFundFromFaucet}
                  disabled={fundingFromFaucet}
                >
                  <Droplets className="mr-1 h-4 w-4" />
                  {fundingFromFaucet ? "Funding..." : "Fund from Faucet"}
                </Button>
              </div>
            </div>
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
