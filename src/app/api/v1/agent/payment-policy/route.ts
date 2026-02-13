import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";

/**
 * GET /api/v1/agent/payment-policy?userId=<id>
 *
 * Allows an agent to read a target user's payment policy before sending
 * a connection request. This way the agent knows if a stake is required
 * and what the minimum/maximum amounts are.
 */
export async function GET(req: NextRequest) {
  try {
    await authenticateAgent(req);

    const userId = req.nextUrl.searchParams.get("userId");
    if (!userId) {
      return NextResponse.json(
        { error: "userId query parameter is required" },
        { status: 400 },
      );
    }

    const profile = await db.profile.findUnique({
      where: { userId },
      include: { paymentPolicy: true },
    });

    if (!profile) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 },
      );
    }

    const policy = profile.paymentPolicy;

    return NextResponse.json({
      userId,
      nearAccountId: profile.nearAccountId,
      policy: policy
        ? {
            requireStake: policy.requireStake,
            minStakeNear: policy.minStakeNear,
            maxStakeNear: policy.maxStakeNear,
          }
        : null,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    console.error("Agent payment-policy error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
