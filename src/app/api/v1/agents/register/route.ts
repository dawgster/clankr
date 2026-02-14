import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agentRegisterSchema } from "@/lib/validators";
import { generateApiKey, generateClaimToken } from "@/lib/agent-auth";
import { createNearSubAccount } from "@/lib/near/account";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name } = agentRegisterSchema.parse(body);

    const { key, hash, prefix } = generateApiKey();
    const claimToken = generateClaimToken();

    const agent = await db.externalAgent.create({
      data: {
        name,
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        claimToken,
        status: "UNCLAIMED",
      },
    });

    // Best-effort NEAR account creation
    let nearAccountId: string | null = null;
    let nearWarning: string | undefined;
    try {
      const near = await createNearSubAccount(agent.id);
      await db.externalAgent.update({
        where: { id: agent.id },
        data: {
          nearAccountId: near.accountId,
          nearPublicKey: near.publicKey,
          nearEncryptedPrivateKey: near.encryptedPrivateKey,
        },
      });
      nearAccountId = near.accountId;
    } catch (nearErr) {
      console.error("NEAR account creation failed:", nearErr);
      nearWarning = "NEAR account creation failed; agent registered without a NEAR wallet";
    }

    return NextResponse.json(
      {
        apiKey: key,
        claimToken,
        nearAccountId,
        ...(nearWarning && { warning: nearWarning }),
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("Agent register error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
