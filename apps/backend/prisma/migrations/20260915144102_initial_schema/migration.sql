-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'ADMIN', 'MODERATOR');

-- CreateEnum
CREATE TYPE "WatchStatus" AS ENUM ('PLANNING', 'WATCHING', 'COMPLETED', 'ON_HOLD', 'DROPPED');

-- CreateEnum
CREATE TYPE "ReleaseLifecycleState" AS ENUM ('DISCOVERED', 'CATALOGED', 'MAPPING_PENDING', 'MAPPED', 'AVAILABLE');

-- CreateEnum
CREATE TYPE "ScanJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "SyncJobType" AS ENUM ('FULL_CATALOG', 'INCREMENTAL_EPISODES', 'BACKFILL', 'REPAIR');

-- CreateEnum
CREATE TYPE "SyncJobStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILURE', 'PARTIAL');

-- CreateEnum
CREATE TYPE "AnimeSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'MAPPED', 'FAILED');

-- CreateEnum
CREATE TYPE "EpisodeSyncStatus" AS ENUM ('PENDING', 'SYNCING', 'MAPPED', 'AVAILABLE', 'FAILED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revoked" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchlistItem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "animeId" INTEGER NOT NULL,
    "status" "WatchStatus" NOT NULL DEFAULT 'PLANNING',
    "progress" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchlistItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WatchHistory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "animeId" INTEGER NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "watchedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WatchHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "theme" TEXT NOT NULL DEFAULT 'dark',
    "autoPlayNext" BOOLEAN NOT NULL DEFAULT true,
    "skipIntro" BOOLEAN NOT NULL DEFAULT false,
    "subtitleLang" TEXT NOT NULL DEFAULT 'en',
    "videoQuality" TEXT NOT NULL DEFAULT 'auto',

    CONSTRAINT "UserPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DiscoveredRelease" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAnimeId" TEXT NOT NULL,
    "providerEpisodeId" TEXT NOT NULL,
    "episodeNumber" INTEGER NOT NULL,
    "episodeTitle" TEXT,
    "airDate" TIMESTAMP(3),
    "isFiller" BOOLEAN NOT NULL DEFAULT false,
    "isRecap" BOOLEAN NOT NULL DEFAULT false,
    "rawData" JSONB,
    "lifecycleState" "ReleaseLifecycleState" NOT NULL DEFAULT 'DISCOVERED',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "scanJobId" TEXT,

    CONSTRAINT "DiscoveredRelease_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ScanJob" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "provider" TEXT,
    "status" "ScanJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "releasesFound" INTEGER NOT NULL DEFAULT 0,
    "releasesNew" INTEGER NOT NULL DEFAULT 0,
    "releasesUpdated" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "correlationId" TEXT NOT NULL,

    CONSTRAINT "ScanJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Anime" (
    "id" SERIAL NOT NULL,
    "anilistId" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "synonyms" TEXT[],
    "image" TEXT,
    "description" TEXT,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "episodeCount" INTEGER,
    "season" TEXT,
    "seasonYear" INTEGER,
    "genres" TEXT[],
    "providerMappings" JSONB NOT NULL,
    "syncStatus" "AnimeSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Anime_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Episode" (
    "id" TEXT NOT NULL,
    "animeId" INTEGER NOT NULL,
    "number" INTEGER NOT NULL,
    "title" TEXT,
    "isFiller" BOOLEAN NOT NULL DEFAULT false,
    "isRecap" BOOLEAN NOT NULL DEFAULT false,
    "airDate" TIMESTAMP(3),
    "providerEpisodeIds" JSONB NOT NULL,
    "syncStatus" "EpisodeSyncStatus" NOT NULL DEFAULT 'PENDING',
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Episode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyncJob" (
    "id" TEXT NOT NULL,
    "jobKey" TEXT NOT NULL,
    "type" "SyncJobType" NOT NULL,
    "provider" TEXT,
    "status" "SyncJobStatus" NOT NULL DEFAULT 'PENDING',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "itemsTotal" INTEGER NOT NULL DEFAULT 0,
    "itemsProcessed" INTEGER NOT NULL DEFAULT 0,
    "itemsFailed" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "correlationId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "retryOf" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "SyncJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_username_idx" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_token_key" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_token_idx" ON "RefreshToken"("token");

-- CreateIndex
CREATE INDEX "WatchlistItem_userId_status_idx" ON "WatchlistItem"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "WatchlistItem_userId_animeId_key" ON "WatchlistItem"("userId", "animeId");

-- CreateIndex
CREATE INDEX "WatchHistory_userId_animeId_idx" ON "WatchHistory"("userId", "animeId");

-- CreateIndex
CREATE INDEX "WatchHistory_userId_watchedAt_idx" ON "WatchHistory"("userId", "watchedAt");

-- CreateIndex
CREATE UNIQUE INDEX "UserPreferences_userId_key" ON "UserPreferences"("userId");

-- CreateIndex
CREATE INDEX "DiscoveredRelease_provider_providerAnimeId_providerEpisodeI_idx" ON "DiscoveredRelease"("provider", "providerAnimeId", "providerEpisodeId");

-- CreateIndex
CREATE INDEX "DiscoveredRelease_provider_providerAnimeId_idx" ON "DiscoveredRelease"("provider", "providerAnimeId");

-- CreateIndex
CREATE INDEX "DiscoveredRelease_lifecycleState_idx" ON "DiscoveredRelease"("lifecycleState");

-- CreateIndex
CREATE INDEX "DiscoveredRelease_firstSeenAt_idx" ON "DiscoveredRelease"("firstSeenAt");

-- CreateIndex
CREATE INDEX "DiscoveredRelease_scanJobId_idx" ON "DiscoveredRelease"("scanJobId");

-- CreateIndex
CREATE UNIQUE INDEX "ScanJob_correlationId_key" ON "ScanJob"("correlationId");

-- CreateIndex
CREATE INDEX "ScanJob_jobKey_startedAt_idx" ON "ScanJob"("jobKey", "startedAt");

-- CreateIndex
CREATE INDEX "ScanJob_status_idx" ON "ScanJob"("status");

-- CreateIndex
CREATE INDEX "ScanJob_provider_idx" ON "ScanJob"("provider");

-- CreateIndex
CREATE UNIQUE INDEX "Anime_anilistId_key" ON "Anime"("anilistId");

-- CreateIndex
CREATE INDEX "Anime_syncStatus_idx" ON "Anime"("syncStatus");

-- CreateIndex
CREATE INDEX "Anime_anilistId_idx" ON "Anime"("anilistId");

-- CreateIndex
CREATE INDEX "Episode_animeId_syncStatus_idx" ON "Episode"("animeId", "syncStatus");

-- CreateIndex
CREATE UNIQUE INDEX "Episode_animeId_number_key" ON "Episode"("animeId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "SyncJob_correlationId_key" ON "SyncJob"("correlationId");

-- CreateIndex
CREATE UNIQUE INDEX "SyncJob_idempotencyKey_key" ON "SyncJob"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SyncJob_jobKey_startedAt_idx" ON "SyncJob"("jobKey", "startedAt");

-- CreateIndex
CREATE INDEX "SyncJob_status_idx" ON "SyncJob"("status");

-- CreateIndex
CREATE INDEX "SyncJob_provider_idx" ON "SyncJob"("provider");

-- CreateIndex
CREATE INDEX "SyncJob_retryOf_idx" ON "SyncJob"("retryOf");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchlistItem" ADD CONSTRAINT "WatchlistItem_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WatchHistory" ADD CONSTRAINT "WatchHistory_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserPreferences" ADD CONSTRAINT "UserPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Episode" ADD CONSTRAINT "Episode_animeId_fkey" FOREIGN KEY ("animeId") REFERENCES "Anime"("id") ON DELETE CASCADE ON UPDATE CASCADE;
