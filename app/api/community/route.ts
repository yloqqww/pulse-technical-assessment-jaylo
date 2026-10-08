import type { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import {
  getUtcDay,
  isCommunityReaction,
  type CommunityPulse,
  type CommunityReaction,
} from "@/lib/community";
import { prisma } from "@/lib/prisma";
import {
  hasOnlyKeys,
  InvalidRequestError,
  MAX_COMMUNITY_BODY_BYTES,
  noStoreJson,
  readLimitedJsonObject,
} from "@/lib/api-security";
import { authenticateRequest } from "@/lib/session-auth";
import { checkDistributedAbuse } from "@/lib/abuse-protection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

class AlreadyContributedError extends Error {}

export async function GET() {
  const day = getUtcDay();
  const row = await prisma.communityPulseDaily.findUnique({ where: { day } });
  return noStoreJson(toPulse(day, row));
}

export async function POST(request: NextRequest) {
  const abuse = await checkDistributedAbuse(request, "thanks");
  if (!abuse.allowed) {
    return noStoreJson(
      { error: "rate limit exceeded", retryAfter: abuse.retryAfterSeconds },
      {
        status: 429,
        headers: { "Retry-After": String(abuse.retryAfterSeconds ?? 60) },
      },
    );
  }

  const session = await authenticateRequest(request);
  if (!session) {
    return noStoreJson({ error: "unauthorized" }, { status: 401 });
  }


  let body: Record<string, unknown>;
  try {
    body = await readLimitedJsonObject(request, MAX_COMMUNITY_BODY_BYTES);
  } catch (error) {
    const message =
      error instanceof InvalidRequestError ? error.message : "invalid body";
    return noStoreJson({ error: message }, { status: 400 });
  }

  const reaction = body.reaction;
  if (!hasOnlyKeys(body, ["reaction"]) || !isCommunityReaction(reaction)) {
    return noStoreJson({ error: "invalid reaction" }, { status: 400 });
  }

  const day = getUtcDay();
  try {
    const row = await prisma.$transaction(async (tx) => {
      const claimed = await tx.presence.updateMany({
        where: { id: session.id, thanksGivenAt: null },
        data: { thanksGivenAt: new Date() },
      });
      if (claimed.count !== 1) throw new AlreadyContributedError();

      return tx.communityPulseDaily.upsert({
        where: { day },
        create: createCounts(day, reaction),
        update: incrementFor(reaction),
      });
    });

    return noStoreJson(toPulse(day, row), { status: 201 });
  } catch (error) {
    if (error instanceof AlreadyContributedError) {
      return noStoreJson(
        { error: "this anonymous session already contributed" },
        { status: 409 },
      );
    }
    throw error;
  }
}

function createCounts(day: string, reaction: CommunityReaction) {
  return {
    day,
    feltHeard: reaction === "heard" ? 1 : 0,
    helped: reaction === "helped" ? 1 : 0,
    madeSmile: reaction === "smile" ? 1 : 0,
    goodListener: reaction === "listener" ? 1 : 0,
  };
}

function incrementFor(
  reaction: CommunityReaction,
): Prisma.CommunityPulseDailyUpdateInput {
  switch (reaction) {
    case "heard":
      return { feltHeard: { increment: 1 } };
    case "helped":
      return { helped: { increment: 1 } };
    case "smile":
      return { madeSmile: { increment: 1 } };
    case "listener":
      return { goodListener: { increment: 1 } };
  }
}

function toPulse(
  day: string,
  row: {
    feltHeard: number;
    helped: number;
    madeSmile: number;
    goodListener: number;
  } | null,
): CommunityPulse {
  const reactions = {
    heard: row?.feltHeard ?? 0,
    helped: row?.helped ?? 0,
    smile: row?.madeSmile ?? 0,
    listener: row?.goodListener ?? 0,
  };
  return {
    day,
    total: Object.values(reactions).reduce((sum, count) => sum + count, 0),
    reactions,
  };
}
