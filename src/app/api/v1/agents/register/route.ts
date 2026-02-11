import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { agentRegisterSchema } from "@/lib/validators";
import { generateApiKey, generateClaimToken } from "@/lib/agent-auth";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name } = agentRegisterSchema.parse(body);

    const { key, hash, prefix } = generateApiKey();
    const claimToken = generateClaimToken();

    await db.externalAgent.create({
      data: {
        name,
        apiKeyHash: hash,
        apiKeyPrefix: prefix,
        claimToken,
        status: "UNCLAIMED",
      },
    });

    return NextResponse.json({ apiKey: key, claimToken }, { status: 201 });
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
