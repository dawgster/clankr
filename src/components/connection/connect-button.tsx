"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { sendConnectionRequest } from "@/lib/actions/connection";
import { UserPlus, Check, Clock } from "lucide-react";

const categories = [
  { value: "NETWORKING", label: "Networking" },
  { value: "COLLABORATION", label: "Collaboration" },
  { value: "HIRING", label: "Hiring" },
  { value: "BUSINESS", label: "Business" },
  { value: "SOCIAL", label: "Social" },
  { value: "OTHER", label: "Other" },
] as const;

interface ConnectButtonProps {
  toUserId: string;
  status: string | null;
}

export function ConnectButton({ toUserId, status }: ConnectButtonProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("OTHER");
  const [intent, setIntent] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  if (status === "connected") {
    return (
      <Button variant="outline" disabled>
        <Check className="mr-2 h-4 w-4" />
        Connected
      </Button>
    );
  }

  if (status === "pending" || sent) {
    return (
      <Button variant="outline" disabled>
        <Clock className="mr-2 h-4 w-4" />
        Pending
      </Button>
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await sendConnectionRequest({
        toUserId,
        category: category as "NETWORKING" | "COLLABORATION" | "HIRING" | "BUSINESS" | "SOCIAL" | "OTHER",
        intent,
      });
      setSent(true);
      setOpen(false);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="mr-2 h-4 w-4" />
          Connect
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Send Connection Request</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Why do you want to connect?</Label>
            <Textarea
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              placeholder="Tell their agent why you'd like to connect..."
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              This message will be evaluated by their AI agent.
            </p>
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Sending..." : "Send Request"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
