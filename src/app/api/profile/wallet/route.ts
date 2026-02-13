import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { nearWalletSchema } from "@/lib/validators";
import { db } from "@/lib/db";

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const data = nearWalletSchema.parse(body);

  const profile = await db.profile.update({
    where: { userId: user.id },
    data: { nearAccountId: data.nearAccountId },
  });

  return NextResponse.json({
    ok: true,
    nearAccountId: profile.nearAccountId,
  });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await db.profile.findUnique({
    where: { userId: user.id },
    select: { nearAccountId: true },
  });

  return NextResponse.json({
    nearAccountId: profile?.nearAccountId ?? null,
  });
}
