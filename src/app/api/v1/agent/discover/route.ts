import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { generateEmbedding } from "@/lib/embedding";

type DiscoverUser = {
  id: string;
  username: string;
  displayName: string;
  bio: string;
  intent: string | null;
  interests: string[];
  agentStatus: string | null;
  similarity: number | null;
};

export async function GET(req: NextRequest) {
  try {
    const agent = await authenticateAgent(req);

    if (!agent.userId) {
      return NextResponse.json(
        { error: "Agent must be claimed to discover users" },
        { status: 403 },
      );
    }

    const profile = await db.profile.findUnique({
      where: { userId: agent.userId },
    });

    const q = req.nextUrl.searchParams.get("q")?.trim();

    let users: DiscoverUser[];

    if (q) {
      const embedding = await generateEmbedding(q);
      const vec = `[${embedding.join(",")}]`;

      users = await db.$queryRaw<DiscoverUser[]>`
        SELECT
          u.id,
          u.username,
          p."displayName",
          p.bio,
          p.intent,
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
        WHERE u.id != ${agent.userId}
          AND (
            p."intentEmbedding" IS NOT NULL
            OR p."displayName" ILIKE ${"%" + q + "%"}
            OR p.bio ILIKE ${"%" + q + "%"}
            OR p.intent ILIKE ${"%" + q + "%"}
          )
        ORDER BY
          CASE
            WHEN p."intentEmbedding" IS NOT NULL
            THEN p."intentEmbedding" <=> ${vec}::vector
            ELSE 2
          END ASC
        LIMIT 50
      `;
    } else {
      const profileId = profile?.id ?? "";

      users = await db.$queryRaw<DiscoverUser[]>`
        SELECT
          u.id,
          u.username,
          p."displayName",
          p.bio,
          p.intent,
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
        LEFT JOIN "Profile" src ON src.id = ${profileId}
        WHERE u.id != ${agent.userId}
        ORDER BY
          CASE
            WHEN p."intentEmbedding" IS NOT NULL AND src."intentEmbedding" IS NOT NULL
            THEN p."intentEmbedding" <=> src."intentEmbedding"
            ELSE 2
          END ASC,
          u."createdAt" DESC
        LIMIT 50
      `;
    }

    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    console.error("Agent discover error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
