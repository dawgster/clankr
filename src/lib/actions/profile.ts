"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { profileSchema, type ProfileInput } from "@/lib/validators";
import { generateEmbedding } from "@/lib/embedding";

export async function createProfile(input: ProfileInput) {
  const user = await requireUser();
  const data = profileSchema.parse(input);

  const profile = await db.profile.upsert({
    where: { userId: user.id },
    update: {
      displayName: data.displayName,
      bio: data.bio || "",
      intent: data.intent || "",
      interests: data.interests || [],
      lookingFor: data.lookingFor || [],
      links: data.links || [],
    },
    create: {
      userId: user.id,
      displayName: data.displayName,
      bio: data.bio || "",
      intent: data.intent || "",
      interests: data.interests || [],
      lookingFor: data.lookingFor || [],
      links: data.links || [],
    },
  });

  // Generate and store embedding if intent is provided
  const intent = data.intent || "";
  if (intent.trim()) {
    const embedding = await generateEmbedding(intent);
    const vec = `[${embedding.join(",")}]`;
    await db.$executeRaw`UPDATE "Profile" SET "intentEmbedding" = ${vec}::vector WHERE id = ${profile.id}`;
  } else {
    await db.$executeRaw`UPDATE "Profile" SET "intentEmbedding" = NULL WHERE id = ${profile.id}`;
  }

  return profile;
}

export async function updateProfile(input: ProfileInput) {
  const user = await requireUser();
  const data = profileSchema.parse(input);

  const profile = await db.profile.update({
    where: { userId: user.id },
    data: {
      displayName: data.displayName,
      bio: data.bio || "",
      intent: data.intent || "",
      interests: data.interests || [],
      lookingFor: data.lookingFor || [],
      links: data.links || [],
    },
  });

  // Generate and store embedding if intent is provided
  const intent = data.intent || "";
  if (intent.trim()) {
    const embedding = await generateEmbedding(intent);
    const vec = `[${embedding.join(",")}]`;
    await db.$executeRaw`UPDATE "Profile" SET "intentEmbedding" = ${vec}::vector WHERE id = ${profile.id}`;
  } else {
    await db.$executeRaw`UPDATE "Profile" SET "intentEmbedding" = NULL WHERE id = ${profile.id}`;
  }

  return profile;
}

export async function getProfile(username: string) {
  return db.user.findUnique({
    where: { username },
    include: {
      profile: true,
      externalAgent: { select: { status: true, name: true } },
    },
  });
}
