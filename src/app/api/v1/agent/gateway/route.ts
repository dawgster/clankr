import { NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db";
import { agentGatewaySchema } from "@/lib/validators";

export async function PUT(req: Request) {
  try {
    const { userId: clerkId } = await auth();
    if (!clerkId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await db.user.findUnique({
      where: { clerkId },
      include: { externalAgent: true },
    });

    if (!user?.externalAgent) {
      return NextResponse.json(
        { error: "No agent connected" },
        { status: 404 },
      );
    }

    const body = await req.json();
    const data = agentGatewaySchema.parse(body);

    const updated = await db.externalAgent.update({
      where: { id: user.externalAgent.id },
      data: {
        gatewayUrl: data.gatewayUrl,
        gatewayToken: data.gatewayToken ?? null,
        webhookEnabled: data.webhookEnabled,
      },
      select: {
        id: true,
        gatewayUrl: true,
        webhookEnabled: true,
      },
    });

    return NextResponse.json(updated);
  } catch (err) {
    if (err instanceof Error && err.name === "ZodError") {
      return NextResponse.json({ error: "Invalid input" }, { status: 400 });
    }
    console.error("Gateway update error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
