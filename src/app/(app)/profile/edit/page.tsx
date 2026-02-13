"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateProfile } from "@/lib/actions/profile";
import { linkNearWallet, updatePaymentPolicy } from "@/lib/actions/payment";
import { TagInput } from "@/components/profile/tag-input";

export default function EditProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [intent, setIntent] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [lookingFor, setLookingFor] = useState<string[]>([]);

  // NEAR wallet state
  const [nearAccountId, setNearAccountId] = useState("");
  const [walletSaving, setWalletSaving] = useState(false);
  const [walletSaved, setWalletSaved] = useState(false);

  // Payment policy state
  const [requireStake, setRequireStake] = useState(false);
  const [minStakeNear, setMinStakeNear] = useState(0);
  const [maxStakeNear, setMaxStakeNear] = useState(10);
  const [dailyMaxNear, setDailyMaxNear] = useState(50);
  const [requireApprovalAbove, setRequireApprovalAbove] = useState<
    number | null
  >(null);
  const [policySaving, setPolicySaving] = useState(false);
  const [policySaved, setPolicySaved] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/profile/me").then((r) => r.json()),
      fetch("/api/profile/wallet").then((r) => r.json()),
      fetch("/api/profile/payment-policy").then((r) => r.json()),
    ])
      .then(([profileData, walletData, policyData]) => {
        if (profileData.profile) {
          setDisplayName(profileData.profile.displayName || "");
          setBio(profileData.profile.bio || "");
          setIntent(profileData.profile.intent || "");
          setInterests(profileData.profile.interests || []);
          setLookingFor(profileData.profile.lookingFor || []);
        }
        if (walletData.nearAccountId) {
          setNearAccountId(walletData.nearAccountId);
        }
        if (policyData.policy) {
          setRequireStake(policyData.policy.requireStake);
          setMinStakeNear(policyData.policy.minStakeNear);
          setMaxStakeNear(policyData.policy.maxStakeNear);
          setDailyMaxNear(policyData.policy.dailyMaxNear);
          setRequireApprovalAbove(policyData.policy.requireApprovalAbove);
        }
      })
      .finally(() => setFetching(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateProfile({
        displayName,
        bio,
        intent,
        interests,
        lookingFor,
        links: [],
      });
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleWalletSave() {
    setWalletSaving(true);
    setWalletSaved(false);
    try {
      await linkNearWallet({
        nearAccountId: nearAccountId.trim() || null,
      });
      setWalletSaved(true);
      setTimeout(() => setWalletSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setWalletSaving(false);
    }
  }

  async function handlePolicySave() {
    setPolicySaving(true);
    setPolicySaved(false);
    try {
      await updatePaymentPolicy({
        requireStake,
        minStakeNear,
        maxStakeNear,
        dailyMaxNear,
        requireApprovalAbove,
      });
      setPolicySaved(true);
      setTimeout(() => setPolicySaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setPolicySaving(false);
    }
  }

  if (fetching) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card>
          <CardContent className="flex items-center justify-center py-12">
            Loading...
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Edit Profile</CardTitle>
          <CardDescription>
            Update your profile information. Your AI agent uses this to
            represent you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="intent">Intent</Label>
              <Textarea
                id="intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Describe who you are and what you're looking for..."
                rows={4}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground">
                This helps match you with relevant people on the discover page.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Interests</Label>
              <TagInput value={interests} onChange={setInterests} />
            </div>

            <div className="space-y-2">
              <Label>Looking For</Label>
              <TagInput value={lookingFor} onChange={setLookingFor} />
            </div>

            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* NEAR Wallet */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle>NEAR Wallet</CardTitle>
            {nearAccountId && (
              <Badge variant="secondary">Connected</Badge>
            )}
          </div>
          <CardDescription>
            Link your NEAR account to enable staked connections. Agents can
            attach NEAR tokens to connection requests as a signal of intent.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nearAccountId">NEAR Account ID</Label>
            <Input
              id="nearAccountId"
              value={nearAccountId}
              onChange={(e) => setNearAccountId(e.target.value)}
              placeholder="alice.near or alice.testnet"
            />
            <p className="text-xs text-muted-foreground">
              Your NEAR account ID (e.g. yourname.near or yourname.testnet)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleWalletSave}
              disabled={walletSaving}
            >
              {walletSaving ? "Saving..." : "Save Wallet"}
            </Button>
            {walletSaved && (
              <span className="text-sm text-green-600">Saved</span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Payment Policy */}
      <Card>
        <CardHeader>
          <CardTitle>Payment Policy</CardTitle>
          <CardDescription>
            Control how your agent handles payment stakes on incoming connection
            requests. These constraints are auditable and enforced
            automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <Label>Require stake for connections</Label>
              <p className="text-xs text-muted-foreground">
                Require senders to stake NEAR tokens with their request
              </p>
            </div>
            <Switch
              checked={requireStake}
              onCheckedChange={setRequireStake}
            />
          </div>

          {requireStake && (
            <>
              <div className="space-y-2">
                <Label htmlFor="minStake">
                  Minimum Stake (NEAR)
                </Label>
                <Input
                  id="minStake"
                  type="number"
                  step="0.01"
                  min="0"
                  value={minStakeNear}
                  onChange={(e) =>
                    setMinStakeNear(parseFloat(e.target.value) || 0)
                  }
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maxStake">
                  Maximum Stake (NEAR)
                </Label>
                <Input
                  id="maxStake"
                  type="number"
                  step="0.01"
                  min="0"
                  value={maxStakeNear}
                  onChange={(e) =>
                    setMaxStakeNear(parseFloat(e.target.value) || 0)
                  }
                />
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="dailyMax">
              Daily Payment Cap (NEAR)
            </Label>
            <Input
              id="dailyMax"
              type="number"
              step="1"
              min="0"
              value={dailyMaxNear}
              onChange={(e) =>
                setDailyMaxNear(parseFloat(e.target.value) || 0)
              }
            />
            <p className="text-xs text-muted-foreground">
              Maximum total NEAR your agent can receive per day
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="approvalThreshold">
              Manual Approval Above (NEAR)
            </Label>
            <Input
              id="approvalThreshold"
              type="number"
              step="0.1"
              min="0"
              value={requireApprovalAbove ?? ""}
              onChange={(e) =>
                setRequireApprovalAbove(
                  e.target.value ? parseFloat(e.target.value) : null,
                )
              }
              placeholder="No threshold (agent decides all)"
            />
            <p className="text-xs text-muted-foreground">
              Stakes above this amount require your manual approval instead of
              agent auto-decision
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handlePolicySave}
              disabled={policySaving}
            >
              {policySaving ? "Saving..." : "Save Policy"}
            </Button>
            {policySaved && (
              <span className="text-sm text-green-600">Saved</span>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
