import { db } from "./db";

/**
 * Create a pending payment transaction for a staked connection request.
 */
export async function createStakeTransaction(
  connectionRequestId: string,
  fromNearAccount: string,
  toNearAccount: string,
  amountNear: number,
) {
  return db.paymentTransaction.create({
    data: {
      connectionRequestId,
      fromNearAccount,
      toNearAccount,
      amountNear,
      status: "PENDING",
    },
  });
}

/**
 * Settle a payment when a connection request is accepted.
 * Marks the transaction as SETTLED and notifies both parties.
 */
export async function settlePayment(connectionRequestId: string) {
  const tx = await db.paymentTransaction.findUnique({
    where: { connectionRequestId },
    include: {
      connectionRequest: {
        select: { fromUserId: true, toUserId: true },
      },
    },
  });

  if (!tx || tx.status !== "PENDING") return null;

  const updated = await db.paymentTransaction.update({
    where: { id: tx.id },
    data: {
      status: "SETTLED",
      settledAt: new Date(),
    },
  });

  // Notify sender that payment was settled
  await db.notification.create({
    data: {
      userId: tx.connectionRequest.fromUserId,
      type: "PAYMENT_SETTLED",
      title: "Payment settled",
      body: `${tx.amountNear} NEAR transferred for accepted connection.`,
      metadata: {
        connectionRequestId,
        transactionId: tx.id,
        amountNear: tx.amountNear,
      },
    },
  });

  // Notify recipient that they received payment
  await db.notification.create({
    data: {
      userId: tx.connectionRequest.toUserId,
      type: "PAYMENT_SETTLED",
      title: "Payment received",
      body: `${tx.amountNear} NEAR received for accepted connection.`,
      metadata: {
        connectionRequestId,
        transactionId: tx.id,
        amountNear: tx.amountNear,
      },
    },
  });

  return updated;
}

/**
 * Refund a staked payment when a connection request is rejected or expires.
 */
export async function refundPayment(connectionRequestId: string) {
  const tx = await db.paymentTransaction.findUnique({
    where: { connectionRequestId },
    include: {
      connectionRequest: {
        select: { fromUserId: true },
      },
    },
  });

  if (!tx || tx.status !== "PENDING") return null;

  const updated = await db.paymentTransaction.update({
    where: { id: tx.id },
    data: {
      status: "REFUNDED",
      refundedAt: new Date(),
    },
  });

  await db.notification.create({
    data: {
      userId: tx.connectionRequest.fromUserId,
      type: "PAYMENT_REFUNDED",
      title: "Stake refunded",
      body: `${tx.amountNear} NEAR refunded — connection was not accepted.`,
      metadata: {
        connectionRequestId,
        transactionId: tx.id,
        amountNear: tx.amountNear,
      },
    },
  });

  return updated;
}

/**
 * Validate a stake amount against target user's payment policy.
 * Returns null if valid, or an error message string.
 */
export async function validateStakeAgainstPolicy(
  toUserId: string,
  stakeNear: number | undefined,
): Promise<string | null> {
  const profile = await db.profile.findUnique({
    where: { userId: toUserId },
    include: { paymentPolicy: true },
  });

  const policy = profile?.paymentPolicy;
  if (!policy) return null; // No policy = no requirements

  if (policy.requireStake && (!stakeNear || stakeNear <= 0)) {
    return `This user requires a minimum stake of ${policy.minStakeNear} NEAR`;
  }

  if (stakeNear) {
    if (stakeNear < policy.minStakeNear) {
      return `Stake must be at least ${policy.minStakeNear} NEAR`;
    }
    if (stakeNear > policy.maxStakeNear) {
      return `Stake must not exceed ${policy.maxStakeNear} NEAR`;
    }
  }

  // Check daily limit
  if (stakeNear) {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const dailyTotal = await db.paymentTransaction.aggregate({
      where: {
        toNearAccount: profile?.nearAccountId ?? "",
        status: { in: ["PENDING", "SETTLED"] },
        createdAt: { gte: todayStart },
      },
      _sum: { amountNear: true },
    });

    const currentDaily = dailyTotal._sum.amountNear ?? 0;
    if (currentDaily + stakeNear > policy.dailyMaxNear) {
      return `Daily payment limit exceeded. Remaining capacity: ${policy.dailyMaxNear - currentDaily} NEAR`;
    }
  }

  return null;
}
