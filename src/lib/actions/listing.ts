"use server";

import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth";
import { listingSchema, type ListingInput, type OfferInput, offerSchema } from "@/lib/validators";
import { inngest } from "@/inngest/client";

export async function createListing(input: ListingInput) {
  const user = await requireUser();
  const data = listingSchema.parse(input);

  return db.listing.create({
    data: {
      sellerId: user.id,
      title: data.title,
      description: data.description,
      price: data.price,
      images: data.images || [],
      tags: data.tags || [],
    },
  });
}

export async function updateListing(id: string, input: ListingInput) {
  const user = await requireUser();
  const data = listingSchema.parse(input);

  return db.listing.update({
    where: { id, sellerId: user.id },
    data: {
      title: data.title,
      description: data.description,
      price: data.price,
      images: data.images || [],
      tags: data.tags || [],
    },
  });
}

export async function archiveListing(id: string) {
  const user = await requireUser();
  return db.listing.update({
    where: { id, sellerId: user.id },
    data: { status: "ARCHIVED" },
  });
}

export async function getListings(query?: string) {
  return db.listing.findMany({
    where: {
      status: "ACTIVE",
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" as const } },
              { description: { contains: query, mode: "insensitive" as const } },
              { tags: { hasSome: [query] } },
            ],
          }
        : {}),
    },
    include: { seller: { include: { profile: true } } },
    orderBy: { createdAt: "desc" },
  });
}

export async function getListing(id: string) {
  return db.listing.findUnique({
    where: { id },
    include: {
      seller: { include: { profile: true } },
      negotiations: {
        include: {
          buyer: { include: { profile: true } },
          conversations: {
            include: { messages: { orderBy: { createdAt: "asc" } } },
          },
        },
      },
    },
  });
}

export async function makeOffer(listingId: string, input: OfferInput) {
  const user = await requireUser();
  const data = offerSchema.parse(input);

  const listing = await db.listing.findUnique({ where: { id: listingId } });
  if (!listing || listing.status !== "ACTIVE") {
    throw new Error("Listing not available");
  }
  if (listing.sellerId === user.id) {
    throw new Error("Cannot make an offer on your own listing");
  }

  const negotiation = await db.negotiation.create({
    data: {
      listingId,
      buyerId: user.id,
      sellerId: listing.sellerId,
      offerPrice: data.offerPrice,
    },
  });

  // Fire Inngest event for agent-to-agent negotiation
  await inngest.send({
    name: "negotiation/offer.created",
    data: {
      negotiationId: negotiation.id,
      message: data.message,
    },
  });

  return negotiation;
}

export async function getMyListings() {
  const user = await requireUser();
  return db.listing.findMany({
    where: { sellerId: user.id },
    include: { negotiations: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function getMyNegotiations() {
  const user = await requireUser();
  return db.negotiation.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerId: user.id }] },
    include: {
      listing: true,
      buyer: { include: { profile: true } },
      seller: { include: { profile: true } },
      conversations: {
        include: { messages: { orderBy: { createdAt: "asc" } } },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}
