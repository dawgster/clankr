"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { updateProfile } from "@/lib/actions/profile";
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
        }
      })
      .finally(() => setFetching(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateProfile({ displayName, bio, intent, interests, lookingFor, links: [] });
      router.refresh();
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
    <div className="mx-auto max-w-2xl">
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
              <Label htmlFor="intent">Intent *</Label>
              <Textarea
                id="intent"
                value={intent}
                onChange={(e) => setIntent(e.target.value)}
                placeholder="Describe who you are and what you're looking for..."
                rows={4}
                maxLength={1000}
                required
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
    </div>
  );
}
