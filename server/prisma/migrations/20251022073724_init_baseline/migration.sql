-- AlterTable
ALTER TABLE "public"."job_context_sessions" ALTER COLUMN "expiresAt" SET DEFAULT now() + interval '24 hours';
