"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateProfile } from "@/lib/actions/profile";
import { TagInput } from "@/components/profile/tag-input";
import { Sparkles } from "lucide-react";

export default function IntentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [saved, setSaved] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [intent, setIntent] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [lookingFor, setLookingFor] = useState<string[]>([]);
  const [hasEmbedding, setHasEmbedding] = useState(false);

  useEffect(() => {
    fetch("/api/profile/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setDisplayName(data.profile.displayName || "");
          setBio(data.profile.bio || "");
          setIntent(data.profile.intent || "");
          setInterests(data.profile.interests || []);
          setLookingFor(data.profile.lookingFor || []);
          setHasEmbedding(!!data.profile.intent?.trim());
        }
      })
      .finally(() => setFetching(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setSaved(false);
    try {
      await updateProfile({
        displayName,
        bio,
        intent,
        interests,
        lookingFor,
        links: [],
      });
      setHasEmbedding(!!intent.trim());
      setSaved(true);

      // Trigger scripted negotiation demo when intent mentions "bottle"
      if (intent.toLowerCase().includes("bottle")) {
        try {
          const res = await fetch("/api/demo/negotiation", { method: "POST" });
          const data = await res.json();
          if (data.conversationId) {
            router.push(`/agent-chats/${data.conversationId}`);
            return;
          }
        } catch (err) {
          console.error("Demo negotiation failed:", err);
        }
      }

      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
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
      <div>
        <h1 className="text-2xl font-bold">My Intent</h1>
        <p className="text-muted-foreground">
          Define what you&apos;re looking for. This powers the discover page and
          helps your agent find the right people.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>Discovery Intent</CardTitle>
            </div>
            {hasEmbedding ? (
              <Badge variant="secondary">Embedding active</Badge>
            ) : (
              <Badge variant="outline">No embedding</Badge>
            )}
          </div>
          <CardDescription>
            Describe who you are and what you&apos;re looking for. This
            generates a semantic embedding used to match you with relevant
            people.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="intent">Intent</Label>
              <Textarea
                id="intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Describe who you are and what you're looking for..."
                rows={5}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground">
                {intent.length}/1000 characters
              </p>
            </div>

            <div className="space-y-2">
              <Label>Interests</Label>
              <TagInput value={interests} onChange={setInterests} />
              <p className="text-xs text-muted-foreground">
                Topics and areas you&apos;re interested in.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Looking For</Label>
              <TagInput value={lookingFor} onChange={setLookingFor} />
              <p className="text-xs text-muted-foreground">
                Types of people or opportunities you want to find.
              </p>
            </div>

            <div className="flex items-center gap-3">
              <Button type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Intent"}
              </Button>
              {saved && (
                <span className="text-sm text-green-600">Saved!</span>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
