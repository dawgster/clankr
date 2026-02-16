import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { generateEmbedding } from "@/lib/embedding";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Search, Sparkles } from "lucide-react";

export const dynamic = "force-dynamic";

type DiscoverUser = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  intent: string | null;
  avatarUrl: string | null;
  interests: string[];
  agentStatus: string | null;
  similarity: number | null;
};

async function discoverBySimilarity(
  currentUserId: string,
  currentProfileId: string
): Promise<DiscoverUser[]> {
  const rows = await db.$queryRaw<DiscoverUser[]>`
    SELECT
      u.id,
      u.username,
      p."displayName",
      p.bio,
      p.intent,
      p."avatarUrl",
      p.interests,
      ea.status AS "agentStatus",
      CASE
        WHEN p."intentEmbedding" IS NOT NULL AND src."intentEmbedding" IS NOT NULL
        THEN 1 - (p."intentEmbedding" <=> src."intentEmbedding")
        ELSE NULL
      END AS similarity
    FROM "User" u
    JOIN "Profile" p ON p."userId" = u.id
    LEFT JOIN "ExternalAgent" ea ON ea."userId" = u.id
    LEFT JOIN "Profile" src ON src.id = ${currentProfileId}
    WHERE u.id != ${currentUserId}
    ORDER BY
      CASE
        WHEN p."intentEmbedding" IS NOT NULL AND src."intentEmbedding" IS NOT NULL
        THEN p."intentEmbedding" <=> src."intentEmbedding"
        ELSE 2
      END ASC,
      u."createdAt" DESC
    LIMIT 50
  `;
  return rows;
}

async function discoverBySearch(
  currentUserId: string,
  query: string
): Promise<DiscoverUser[]> {
  const embedding = await generateEmbedding(query);
  const vec = `[${embedding.join(",")}]`;

  const rows = await db.$queryRaw<DiscoverUser[]>`
    SELECT
      u.id,
      u.username,
      p."displayName",
      p.bio,
      p.intent,
      p."avatarUrl",
      p.interests,
      ea.status AS "agentStatus",
      CASE
        WHEN p."intentEmbedding" IS NOT NULL
        THEN 1 - (p."intentEmbedding" <=> ${vec}::vector)
        ELSE NULL
      END AS similarity
    FROM "User" u
    JOIN "Profile" p ON p."userId" = u.id
    LEFT JOIN "ExternalAgent" ea ON ea."userId" = u.id
    WHERE u.id != ${currentUserId}
      AND (
        p."intentEmbedding" IS NOT NULL
        OR p."displayName" ILIKE ${"%" + query + "%"}
        OR p.bio ILIKE ${"%" + query + "%"}
        OR p.intent ILIKE ${"%" + query + "%"}
      )
    ORDER BY
      CASE
        WHEN p."intentEmbedding" IS NOT NULL
        THEN p."intentEmbedding" <=> ${vec}::vector
        ELSE 2
      END ASC
    LIMIT 50
  `;
  return rows;
}

export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const currentUser = await requireUser();

  // Get current user's profile for similarity comparison
  const currentProfile = await db.profile.findUnique({
    where: { userId: currentUser.id },
  });

  let users: DiscoverUser[];
  if (q?.trim()) {
    users = await discoverBySearch(currentUser.id, q.trim());
  } else if (currentProfile) {
    users = await discoverBySimilarity(currentUser.id, currentProfile.id);
  } else {
    users = await discoverBySimilarity(currentUser.id, "");
  }

  const hasIntent = currentProfile?.intent?.trim();

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Discover People</h1>
        <p className="text-muted-foreground">
          Find interesting people to connect with. Their AI agent will evaluate
          your request.
        </p>
      </div>

      {!hasIntent && (
        <Link href="/intent">
          <div className="flex items-center gap-3 rounded-lg border border-dashed p-4 transition-colors hover:bg-accent/50">
            <Sparkles className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Set your intent</p>
              <p className="text-xs text-muted-foreground">
                Describe who you are and what you&apos;re looking for to get
                personalized recommendations.
              </p>
            </div>
          </div>
        </Link>
      )}

      <form className="relative">
        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
        <Input
          name="q"
          defaultValue={q || ""}
          placeholder="Search by name, bio, or intent..."
          className="pl-10"
        />
      </form>

      <div className="grid gap-4 sm:grid-cols-2">
        {users.map((user) => (
          <Link key={user.id} href={`/profile/${user.username}`}>
            <Card className="transition-colors hover:bg-accent/50">
              <CardContent className="flex items-start gap-4 p-4">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={user.avatarUrl || undefined} />
                  <AvatarFallback>
                    {user.displayName.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold">{user.displayName}</h3>
                  <p className="text-sm text-muted-foreground">
                    @{user.username}
                  </p>
                  {user.intent && (
                    <p className="mt-1 line-clamp-2 text-sm">{user.intent}</p>
                  )}
                  {!user.intent && user.bio && (
                    <p className="mt-1 line-clamp-2 text-sm">{user.bio}</p>
                  )}
                  {user.interests.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {user.interests.slice(0, 4).map((i) => (
                        <Badge
                          key={i}
                          variant="secondary"
                          className="text-xs"
                        >
                          {i}
                        </Badge>
                      ))}
                      {user.interests.length > 4 && (
                        <Badge variant="outline" className="text-xs">
                          +{user.interests.length - 4}
                        </Badge>
                      )}
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    {user.agentStatus === "ACTIVE" && (
                      <Badge variant="outline" className="text-xs">
                        Agent connected
                      </Badge>
                    )}
                    {user.similarity != null && user.similarity > 0.3 && (
                      <Badge variant="secondary" className="text-xs">
                        {Math.round(user.similarity * 100)}% match
                      </Badge>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {users.length === 0 && (
        <div className="py-12 text-center text-muted-foreground">
          {q ? `No users found matching "${q}"` : "No other users yet"}
        </div>
      )}
    </div>
  );
}
