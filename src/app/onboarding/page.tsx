"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Bot } from "lucide-react";
import { createProfile } from "@/lib/actions/profile";
import { TagInput } from "@/components/profile/tag-input";

export default function OnboardingPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  const [intent, setIntent] = useState("");
  const [interests, setInterests] = useState<string[]>([]);
  const [lookingFor, setLookingFor] = useState<string[]>([]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await createProfile({
        displayName,
        bio,
        intent,
        interests,
        lookingFor,
        links: [],
      });
      router.push("/messages");
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary">
            <Bot className="h-6 w-6 text-primary-foreground" />
          </div>
          <CardTitle className="text-2xl">Welcome to clankr</CardTitle>
          <p className="text-sm text-muted-foreground">
            Set up your profile to get started on clankr.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="How should people know you?"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bio">Bio</Label>
              <Textarea
                id="bio"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
                placeholder="Tell people about yourself..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="intent">Intent</Label>
              <Textarea
                id="intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Describe who you are and what you're looking for..."
                rows={3}
                maxLength={1000}
              />
              <p className="text-xs text-muted-foreground">
                This helps match you with relevant people on the discover page.
              </p>
            </div>

            <div className="space-y-2">
              <Label>Interests</Label>
              <TagInput
                value={interests}
                onChange={setInterests}
                placeholder="Add an interest..."
              />
            </div>

            <div className="space-y-2">
              <Label>Looking For</Label>
              <TagInput
                value={lookingFor}
                onChange={setLookingFor}
                placeholder="What are you looking for?"
              />
            </div>

            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Setting up..." : "Create Profile"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
