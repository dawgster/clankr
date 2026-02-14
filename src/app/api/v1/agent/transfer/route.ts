import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticateAgent, AuthError } from "@/lib/agent-auth";
import { agentTransferSchema } from "@/lib/validators";
import { transferNear } from "@/lib/near/transfer";

export async function POST(req: NextRequest) {
  try {
    const agent = await authenticateAgent(req);

    if (!agent.userId) {
      return NextResponse.json(
        { error: "Agent must be claimed to transfer NEAR" },
        { status: 403 },
      );
    }

    const body = await req.json();
    const { recipientUserId, amount } = agentTransferSchema.parse(body);

    if (recipientUserId === agent.userId) {
      return NextResponse.json(
        { error: "Cannot transfer to yourself" },
        { status: 400 },
      );
    }

    // Verify bidirectional connection exists
    const connection = await db.connection.findFirst({
      where: {
        OR: [
          { userAId: agent.userId, userBId: recipientUserId },
          { userAId: recipientUserId, userBId: agent.userId },
        ],
      },
    });

    if (!connection) {
      return NextResponse.json(
        { error: "Not connected with this user" },
        { status: 403 },
      );
    }

    // Verify sender has NEAR account
    if (!agent.nearAccountId || !agent.nearEncryptedPrivateKey) {
      return NextResponse.json(
        { error: "Sender agent has no NEAR account" },
        { status: 422 },
      );
    }

    // Look up recipient's agent and NEAR account
    const recipientAgent = await db.externalAgent.findFirst({
      where: { userId: recipientUserId, status: "ACTIVE" },
    });

    if (!recipientAgent?.nearAccountId) {
      return NextResponse.json(
        { error: "Recipient agent has no NEAR account" },
        { status: 422 },
      );
    }

    const result = await transferNear({
      senderAccountId: agent.nearAccountId,
      senderEncryptedPrivateKey: agent.nearEncryptedPrivateKey,
      receiverAccountId: recipientAgent.nearAccountId,
      amount,
    });

    return NextResponse.json({
      ok: true,
      transactionHash: result.transactionHash,
      senderAccountId: result.senderAccountId,
      receiverAccountId: result.receiverAccountId,
      amountYocto: result.amountYocto,
    });
  } catch (err) {
    if (err instanceof AuthError) {
      return NextResponse.json(
        { error: err.message },
        { status: err.status },
      );
    }
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
    console.error("Agent transfer error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
