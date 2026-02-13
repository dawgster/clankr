import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { paymentPolicySchema } from "@/lib/validators";
import { db } from "@/lib/db";

export async function PUT(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await db.profile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) {
    return NextResponse.json({ error: "Profile not found" }, { status: 404 });
  }

  const body = await req.json();
  const data = paymentPolicySchema.parse(body);

  const policy = await db.paymentPolicy.upsert({
    where: { profileId: profile.id },
    update: {
      requireStake: data.requireStake,
      minStakeNear: data.minStakeNear,
      maxStakeNear: data.maxStakeNear,
      dailyMaxNear: data.dailyMaxNear,
      requireApprovalAbove: data.requireApprovalAbove ?? null,
    },
    create: {
      profileId: profile.id,
      requireStake: data.requireStake,
      minStakeNear: data.minStakeNear,
      maxStakeNear: data.maxStakeNear,
      dailyMaxNear: data.dailyMaxNear,
      requireApprovalAbove: data.requireApprovalAbove ?? null,
    },
  });

  return NextResponse.json({ ok: true, policy });
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const profile = await db.profile.findUnique({
    where: { userId: user.id },
    include: { paymentPolicy: true },
  });

  return NextResponse.json({
    policy: profile?.paymentPolicy ?? null,
  });
}
