import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { startScriptedNegotiation } from "@/lib/demo/scripted-negotiation";

export async function POST() {
  try {
    const user = await requireUser();
    const { conversationId } = await startScriptedNegotiation(user.id);
    return NextResponse.json({ conversationId });
  } catch (err) {
    console.error("Demo negotiation error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 400 },
    );
  }
}
