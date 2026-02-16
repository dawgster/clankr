"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
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
import { Sparkles } from "lucide-react";

export default function EditProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");

  useEffect(() => {
    fetch("/api/profile/me")
      .then((r) => r.json())
      .then((data) => {
        if (data.profile) {
          setDisplayName(data.profile.displayName || "");
          setBio(data.profile.bio || "");
        }
      })
      .finally(() => setFetching(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await updateProfile({ displayName, bio, links: [] });
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

            <Button type="submit" disabled={loading}>
              {loading ? "Saving..." : "Save Changes"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Link href="/intent">
        <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 transition-colors hover:bg-accent/50">
          <Sparkles className="h-5 w-5 text-muted-foreground" />
          <div>
            <p className="text-sm font-medium">Manage your discovery intent</p>
            <p className="text-xs text-muted-foreground">
              Set your intent, interests, and what you&apos;re looking for to
              get matched with relevant people.
            </p>
          </div>
        </div>
      </Link>
    </div>
  );
}
