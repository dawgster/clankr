import { headers } from "next/headers";
import { Webhook } from "svix";
import { db } from "@/lib/db";

type ClerkWebhookEvent = {
  type: string;
  data: {
    id: string;
    email_addresses: Array<{ email_address: string }>;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    image_url: string | null;
  };
};

export async function POST(req: Request) {
  const headerPayload = await headers();
  const svixId = headerPayload.get("svix-id");
  const svixTimestamp = headerPayload.get("svix-timestamp");
  const svixSignature = headerPayload.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  const payload = await req.json();
  const body = JSON.stringify(payload);

  const wh = new Webhook(process.env.CLERK_WEBHOOK_SECRET!);

  let evt: ClerkWebhookEvent;

  try {
    evt = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as ClerkWebhookEvent;
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const { id, email_addresses, username, first_name, image_url } = evt.data;
    const email = email_addresses[0]?.email_address;
    if (!email) return new Response("No email", { status: 400 });

    const generatedUsername =
      username || first_name?.toLowerCase().replace(/\s+/g, "") || id.slice(0, 12);

    await db.user.upsert({
      where: { clerkId: id },
      update: {
        email,
        username: generatedUsername,
      },
      create: {
        clerkId: id,
        email,
        username: generatedUsername,
      },
    });

    // Create a default profile placeholder if image is available
    if (evt.type === "user.created" && image_url) {
      const user = await db.user.findUnique({ where: { clerkId: id } });
      if (user) {
        await db.profile.upsert({
          where: { userId: user.id },
          update: { avatarUrl: image_url },
          create: {
            userId: user.id,
            displayName: first_name || generatedUsername,
            avatarUrl: image_url,
          },
        });
      }
    }
  }

  if (evt.type === "user.deleted") {
    await db.user.deleteMany({ where: { clerkId: evt.data.id } });
  }

  return new Response("OK", { status: 200 });
}
