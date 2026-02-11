import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import Link from "next/link";
import { Plus, Search } from "lucide-react";

export default async function MarketplacePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  await requireUser();

  const listings = await db.listing.findMany({
    where: {
      status: "ACTIVE",
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } },
              { tags: { hasSome: [q] } },
            ],
          }
        : {}),
    },
    include: { seller: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Marketplace</h1>
          <p className="text-muted-foreground">
            Browse listings and let your agents negotiate the best deals.
          </p>
        </div>
        <Link href="/marketplace/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Listing
          </Button>
        </Link>
      </div>

      <form className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q || ""}
          placeholder="Search listings..."
          className="pl-10"
        />
      </form>

      {listings.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            {q ? `No listings matching "${q}"` : "No listings yet. Be the first!"}
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => {
            const profile = listing.seller.profile;
            return (
              <Link key={listing.id} href={`/marketplace/${listing.id}`}>
                <Card className="h-full transition-colors hover:bg-accent/50">
                  <CardContent className="p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <span className="text-lg font-bold">
                        ${listing.price.toLocaleString()}
                      </span>
                      <Badge variant="outline">{listing.status}</Badge>
                    </div>
                    <h3 className="font-semibold">{listing.title}</h3>
                    <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                      {listing.description}
                    </p>
                    {listing.tags.length > 0 && (
                      <div className="mt-3 flex flex-wrap gap-1">
                        {listing.tags.slice(0, 3).map((tag) => (
                          <Badge
                            key={tag}
                            variant="secondary"
                            className="text-xs"
                          >
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                    <div className="mt-4 flex items-center gap-2">
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={profile?.avatarUrl || undefined} />
                        <AvatarFallback className="text-xs">
                          {profile?.displayName?.slice(0, 2).toUpperCase() ||
                            "??"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="text-xs text-muted-foreground">
                        {profile?.displayName || listing.seller.username}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
