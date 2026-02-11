"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { makeOffer } from "@/lib/actions/listing";

export function MakeOfferForm({
  listingId,
  askingPrice,
}: {
  listingId: string;
  askingPrice: number;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [offerPrice, setOfferPrice] = useState(askingPrice.toString());
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    try {
      await makeOffer(listingId, {
        offerPrice: parseFloat(offerPrice),
        message,
      });
      router.refresh();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Make an Offer</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Your Offer ($)</Label>
            <Input
              type="number"
              step="0.01"
              min="0.01"
              value={offerPrice}
              onChange={(e) => setOfferPrice(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground">
              Asking price: ${askingPrice.toLocaleString()}
            </p>
          </div>
          <div className="space-y-2">
            <Label>Message to their agent (optional)</Label>
            <Textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Any context for the negotiation..."
              rows={3}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Submitting..." : "Submit Offer"}
          </Button>
          <p className="text-xs text-muted-foreground">
            Your agent and the seller&apos;s agent will negotiate on your behalf.
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
