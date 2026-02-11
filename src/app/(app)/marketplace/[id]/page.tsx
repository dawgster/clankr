import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { MakeOfferForm } from "@/components/marketplace/make-offer-form";
import { NegotiationView } from "@/components/marketplace/negotiation-view";
import Link from "next/link";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await requireUser();

  const listing = await db.listing.findUnique({
    where: { id },
    include: {
      seller: { include: { profile: true } },
      negotiations: {
        where: {
          OR: [{ buyerId: user.id }, { sellerId: user.id }],
        },
        include: {
          buyer: { include: { profile: true } },
          events: { orderBy: { createdAt: "asc" } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!listing) notFound();

  const isOwner = listing.sellerId === user.id;
  const profile = listing.seller.profile;
  const myNegotiation = listing.negotiations[0];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl">{listing.title}</CardTitle>
              <p className="mt-1 text-3xl font-bold text-primary">
                ${listing.price.toLocaleString()}
              </p>
            </div>
            <Badge
              variant={listing.status === "ACTIVE" ? "default" : "secondary"}
            >
              {listing.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="whitespace-pre-wrap">{listing.description}</p>

          {listing.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {listing.tags.map((tag) => (
                <Badge key={tag} variant="secondary">
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3 border-t pt-4">
            <Link href={`/profile/${listing.seller.username}`}>
              <div className="flex items-center gap-2">
                <Avatar>
                  <AvatarImage src={profile?.avatarUrl || undefined} />
                  <AvatarFallback>
                    {profile?.displayName?.slice(0, 2).toUpperCase() || "??"}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="text-sm font-medium">
                    {profile?.displayName || listing.seller.username}
                  </p>
                  <p className="text-xs text-muted-foreground">Seller</p>
                </div>
              </div>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Make Offer or View Negotiation */}
      {!isOwner && listing.status === "ACTIVE" && !myNegotiation && (
        <MakeOfferForm listingId={listing.id} askingPrice={listing.price} />
      )}

      {myNegotiation && <NegotiationView negotiation={myNegotiation} />}

      {isOwner && listing.negotiations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Negotiations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {listing.negotiations.map((neg) => (
              <NegotiationView key={neg.id} negotiation={neg} />
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
