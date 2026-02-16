import { NextRequest, NextResponse } from "next/server";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { getNearBalance } from "@/lib/near/balance";

export async function GET(req: NextRequest) {
  try {
    const agent = await authenticateAgent(req);

    if (!agent.userId) {
      return NextResponse.json(
        { error: "Agent must be claimed to check balance" },
        { status: 403 },
      );
    }

    if (!agent.nearAccountId) {
      return NextResponse.json(
        { error: "Agent has no NEAR account" },
        { status: 422 },
      );
    }

    const balance = await getNearBalance(agent.nearAccountId);

    return NextResponse.json({
      ok: true,
      accountId: balance.accountId,
      balanceYocto: balance.balanceYocto,
      balanceNear: balance.balanceNear,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    console.error("Agent balance error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
