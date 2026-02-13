import { requireUser } from "@/lib/auth";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-100 text-yellow-800",
  SETTLED: "bg-green-100 text-green-800",
  REFUNDED: "bg-blue-100 text-blue-800",
  FAILED: "bg-red-100 text-red-800",
};

export default async function PaymentsPage() {
  const user = await requireUser();
  if (!user.profile) redirect("/onboarding");

  const profile = await db.profile.findUnique({
    where: { userId: user.id },
    include: { paymentPolicy: true },
  });

  const transactions = await db.paymentTransaction.findMany({
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
          fromUserId: true,
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

  // Aggregate stats
  const settled = transactions.filter((t) => t.status === "SETTLED");
  const pending = transactions.filter((t) => t.status === "PENDING");
  const totalEarned = settled
    .filter((t) => t.connectionRequest.fromUserId !== user.id)
    .reduce((sum, t) => sum + t.amountNear, 0);
  const totalSpent = settled
    .filter((t) => t.connectionRequest.fromUserId === user.id)
    .reduce((sum, t) => sum + t.amountNear, 0);
  const totalPending = pending.reduce((sum, t) => sum + t.amountNear, 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payments</h1>
        <p className="text-muted-foreground">
          Track NEAR stakes on your connection requests. All transactions are
          auditable.
        </p>
      </div>

      {/* Wallet status */}
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <div className="flex-1">
            <p className="text-sm font-medium text-muted-foreground">
              NEAR Wallet
            </p>
            <p className="font-mono text-sm">
              {profile?.nearAccountId || "Not connected"}
            </p>
          </div>
          {profile?.paymentPolicy?.requireStake && (
            <Badge variant="secondary">
              Requires {profile.paymentPolicy.minStakeNear}+ NEAR
            </Badge>
          )}
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalEarned.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">NEAR Earned</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalSpent.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">NEAR Spent</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold">{totalPending.toFixed(2)}</p>
            <p className="text-sm text-muted-foreground">NEAR Pending</p>
          </CardContent>
        </Card>
      </div>

      {/* Transaction log */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {transactions.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No payment transactions yet. Stakes are created when agents attach
              NEAR tokens to connection requests.
            </p>
          ) : (
            <div className="space-y-3">
              {transactions.map((tx) => {
                const isSender =
                  tx.connectionRequest.fromUserId === user.id;
                const peerName = isSender
                  ? tx.connectionRequest.toUser.profile?.displayName ||
                    tx.connectionRequest.toUser.username
                  : tx.connectionRequest.fromUser.profile?.displayName ||
                    tx.connectionRequest.fromUser.username;

                return (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between rounded-lg border p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium">
                          {isSender ? "Sent to" : "Received from"} {peerName}
                        </p>
                        <Badge
                          className={statusColors[tx.status] || ""}
                        >
                          {tx.status}
                        </Badge>
                      </div>
                      <p className="mt-1 truncate text-xs text-muted-foreground">
                        {tx.connectionRequest.intent}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(tx.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="text-right">
                      <p
                        className={`text-lg font-bold ${
                          isSender ? "text-red-600" : "text-green-600"
                        }`}
                      >
                        {isSender ? "-" : "+"}
                        {tx.amountNear} NEAR
                      </p>
                      {tx.nearTxHash && (
                        <p className="font-mono text-xs text-muted-foreground">
                          {tx.nearTxHash.slice(0, 8)}...
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
