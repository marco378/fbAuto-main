-- CreateEnum
CREATE TYPE "public"."JobType" AS ENUM ('FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'FREELANCE');

-- CreateEnum
CREATE TYPE "public"."PostStatus" AS ENUM ('PENDING', 'POSTING', 'SUCCESS', 'FAILED', 'MONITORING');

-- CreateEnum
CREATE TYPE "public"."ResponseStatus" AS ENUM ('PENDING', 'SENT', 'FAILED', 'NO_RESPONSE_NEEDED');

-- CreateEnum
CREATE TYPE "public"."CandidateEligibility" AS ENUM ('PENDING', 'MOST_ELIGIBLE', 'ELIGIBLE', 'NOT_ELIGIBLE', 'SHORTLISTED');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upddatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."facebook_cookies" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "cookies" JSONB NOT NULL,
    "isValid" BOOLEAN NOT NULL DEFAULT true,
    "lastUsed" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "facebook_cookies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."facebook_credentials" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upddatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "facebook_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."jobs" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "jobType" "public"."JobType" NOT NULL,
    "experiance" TEXT,
    "salaryRange" TEXT,
    "description" TEXT NOT NULL,
    "requirements" TEXT[],
    "responsibities" TEXT[],
    "perks" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "facebookGroups" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upddatedAt" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."job_posts" (
    "id" TEXT NOT NULL,
    "facebookGroupUrl" TEXT NOT NULL,
    "postUrl" TEXT,
    "status" "public"."PostStatus" NOT NULL,
    "errorMessage" TEXT,
    "attemptNumber" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "jobId" TEXT NOT NULL,

    CONSTRAINT "job_posts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."post_comments" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "authorName" TEXT,
    "authorId" TEXT,
    "content" TEXT NOT NULL,
    "isInterested" BOOLEAN NOT NULL DEFAULT false,
    "responseStatus" "public"."ResponseStatus" NOT NULL DEFAULT 'PENDING',
    "messengerLink" TEXT,
    "messengerThreadId" TEXT,
    "conversationStarted" BOOLEAN NOT NULL DEFAULT false,
    "lastInteractionAt" TIMESTAMP(3),
    "contextData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upddatedAt" TIMESTAMP(3) NOT NULL,
    "postId" TEXT NOT NULL,

    CONSTRAINT "post_comments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."candidates" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "senderId" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "experience" TEXT,
    "skills" TEXT[],
    "resumeUrl" TEXT,
    "resumeFileName" TEXT,
    "resumeUploadedAt" TIMESTAMP(3),
    "eligibility" "public"."CandidateEligibility" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "messengerConversation" JSONB,
    "conversationSummary" TEXT,
    "screeningScore" INTEGER,
    "keyStrengths" TEXT[],
    "concerns" TEXT[],
    "availableForInterview" BOOLEAN NOT NULL DEFAULT false,
    "preferredInterviewTime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "upddatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "sender" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "messageType" TEXT NOT NULL DEFAULT 'text',
    "timestamp" TIMESTAMP(3) NOT NULL,
    "attachmentUrl" TEXT,
    "attachmentType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversation_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."post_metrics" (
    "id" TEXT NOT NULL,
    "totalComments" INTEGER NOT NULL DEFAULT 0,
    "interestedCount" INTEGER NOT NULL DEFAULT 0,
    "respondedCount" INTEGER NOT NULL DEFAULT 0,
    "eligibleCount" INTEGER NOT NULL DEFAULT 0,
    "views" INTEGER NOT NULL DEFAULT 0,
    "reactions" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "postId" TEXT NOT NULL,

    CONSTRAINT "post_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."job_context_sessions" (
    "id" SERIAL NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "jobPostId" TEXT,
    "contextData" JSONB NOT NULL,
    "facebookUserId" TEXT,
    "conversationStarted" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastAccessedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT now() + interval '24 hours',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "job_context_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."conversation_store" (
    "id" SERIAL NOT NULL,
    "sender_id" TEXT NOT NULL,
    "content" TEXT NOT NULL,

    CONSTRAINT "conversation_store_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."extension_tokens" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "name" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deviceInfo" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "userId" TEXT NOT NULL,

    CONSTRAINT "extension_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_cookies_email_key" ON "public"."facebook_cookies"("email");

-- CreateIndex
CREATE UNIQUE INDEX "facebook_credentials_userId_key" ON "public"."facebook_credentials"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "post_metrics_postId_key" ON "public"."post_metrics"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "job_context_sessions_sessionToken_key" ON "public"."job_context_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "job_context_sessions_sessionToken_idx" ON "public"."job_context_sessions"("sessionToken");

-- CreateIndex
CREATE INDEX "job_context_sessions_facebookUserId_idx" ON "public"."job_context_sessions"("facebookUserId");

-- CreateIndex
CREATE INDEX "job_context_sessions_isActive_expiresAt_idx" ON "public"."job_context_sessions"("isActive", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "extension_tokens_token_key" ON "public"."extension_tokens"("token");

-- CreateIndex
CREATE INDEX "extension_tokens_token_idx" ON "public"."extension_tokens"("token");

-- CreateIndex
CREATE INDEX "extension_tokens_userId_isActive_idx" ON "public"."extension_tokens"("userId", "isActive");

-- AddForeignKey
ALTER TABLE "public"."facebook_credentials" ADD CONSTRAINT "facebook_credentials_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."jobs" ADD CONSTRAINT "jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."job_posts" ADD CONSTRAINT "job_posts_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "public"."jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."post_comments" ADD CONSTRAINT "post_comments_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."post_metrics" ADD CONSTRAINT "post_metrics_postId_fkey" FOREIGN KEY ("postId") REFERENCES "public"."job_posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."extension_tokens" ADD CONSTRAINT "extension_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
