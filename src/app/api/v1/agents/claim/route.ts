import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { agentClaimSchema } from "@/lib/validators";

export async function POST(req: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({ where: { clerkId } });
    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }

    // Check if user already has an agent
    const existing = await db.externalAgent.findUnique({
      where: { userId: user.id },
    });
    if (existing) {
      return NextResponse.json(
        { error: "User already has a connected agent" },
        { status: 409 },
      );
    }

    const body = await req.json();
    const { claimToken } = agentClaimSchema.parse(body);

    const agent = await db.externalAgent.findUnique({
      where: { claimToken },
    });

    if (!agent) {
      return NextResponse.json(
        { error: "Invalid claim token" },
        { status: 404 },
      );
    }

    if (agent.status !== "UNCLAIMED") {
      return NextResponse.json(
        { error: "Agent already claimed" },
        { status: 409 },
      );
    }

    const updated = await db.externalAgent.update({
      where: { id: agent.id },
      data: {
        userId: user.id,
        status: "ACTIVE",
        claimToken: null,
      },
      select: { id: true, name: true, status: true, apiKeyPrefix: true, nearAccountId: true },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("Agent claim error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
