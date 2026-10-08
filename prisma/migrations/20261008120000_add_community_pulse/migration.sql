ALTER TABLE "Presence" ADD COLUMN "thanksGivenAt" TIMESTAMP(3);

CREATE TABLE "CommunityPulseDaily" (
    "day" TEXT NOT NULL,
    "feltHeard" INTEGER NOT NULL DEFAULT 0,
    "helped" INTEGER NOT NULL DEFAULT 0,
    "madeSmile" INTEGER NOT NULL DEFAULT 0,
    "goodListener" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunityPulseDaily_pkey" PRIMARY KEY ("day")
);
