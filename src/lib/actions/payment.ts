"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import {
  nearWalletSchema,
  paymentPolicySchema,
  type NearWalletInput,
  type PaymentPolicyInput,
} from "@/lib/validators";

export async function linkNearWallet(input: NearWalletInput) {
  const user = await requireUser();
  const data = nearWalletSchema.parse(input);

  return db.profile.update({
    where: { userId: user.id },
    data: { nearAccountId: data.nearAccountId },
  });
}

export async function getPaymentPolicy() {
  const user = await requireUser();

  const profile = await db.profile.findUnique({
    where: { userId: user.id },
    include: { paymentPolicy: true },
  });

  return profile?.paymentPolicy ?? null;
}

export async function updatePaymentPolicy(input: PaymentPolicyInput) {
  const user = await requireUser();
  const data = paymentPolicySchema.parse(input);

  const profile = await db.profile.findUnique({
    where: { userId: user.id },
  });
  if (!profile) throw new Error("Profile not found");

  return db.paymentPolicy.upsert({
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
}

export async function getMyPaymentTransactions() {
  const user = await requireUser();

  return db.paymentTransaction.findMany({
    where: {
      connectionRequest: {
        OR: [{ fromUserId: user.id }, { toUserId: user.id }],
      },
    },
    include: {
      connectionRequest: {
        select: {
          id: true,
          intent: true,
          status: true,
          fromUser: {
            select: {
              username: true,
              profile: { select: { displayName: true } },
            },
          },
          toUser: {
            select: {
              username: true,
              profile: { select: { displayName: true } },
            },
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}
