import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SentRequests } from "@/components/connection/sent-requests";
import { ReceivedRequests } from "@/components/connection/received-requests";

export default async function RequestsPage() {
  const user = await requireUser();

  const [sent, received, userAgent] = await Promise.all([
    db.connectionRequest.findMany({
      where: { fromUserId: user.id },
      include: {
        toUser: { include: { profile: true } },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.connectionRequest.findMany({
      where: { toUserId: user.id },
      include: {
        fromUser: { include: { profile: true } },
        events: {
          where: {
            status: { in: ["PENDING", "DELIVERED"] },
            expiresAt: { gt: new Date() },
          },
          select: { id: true, status: true },
          take: 1,
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    db.externalAgent.findFirst({
      where: { userId: user.id, status: "ACTIVE" },
      select: { id: true },
    }),
  ]);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Connection Requests</h1>
        <p className="text-muted-foreground">
          Track your sent and received connection requests.
        </p>
      </div>

      <Tabs defaultValue="received">
        <TabsList>
          <TabsTrigger value="received">
            Received ({received.length})
          </TabsTrigger>
          <TabsTrigger value="sent">Sent ({sent.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="received" className="mt-6">
          <ReceivedRequests
            requests={received}
            hasActiveAgent={!!userAgent}
          />
        </TabsContent>

        <TabsContent value="sent" className="mt-6">
          <SentRequests requests={sent} currentUserId={user.id} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
