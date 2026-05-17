-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('USER', 'ADMIN', 'PREMIUM');

-- CreateEnum
CREATE TYPE "InterviewMode" AS ENUM ('TEXT', 'VOICE', 'VIDEO_SIM');

-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('CONFIGURING', 'IN_PROGRESS', 'PROCESSING', 'COMPLETED', 'ABANDONED', 'ERROR');

-- CreateEnum
CREATE TYPE "QuestionCategory" AS ENUM ('BEHAVIORAL', 'TECHNICAL', 'SYSTEM_DESIGN', 'CODING', 'SITUATIONAL', 'CULTURE_FIT');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "role" "RoleType" NOT NULL DEFAULT 'USER',
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "isRevoked" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "userAgent" TEXT,
    "ipAddress" TEXT,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resumes" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/pdf',
    "parsedText" TEXT,
    "parsedSkills" JSONB,
    "parsedRoles" JSONB,
    "parsedSummary" TEXT,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "resumes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "InterviewMode" NOT NULL,
    "status" "SessionStatus" NOT NULL DEFAULT 'CONFIGURING',
    "targetRole" TEXT NOT NULL,
    "difficulty" INTEGER NOT NULL DEFAULT 3,
    "durationSeconds" INTEGER,
    "questionCount" INTEGER NOT NULL DEFAULT 5,
    "resumeContext" JSONB,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "interview_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "interview_questions" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sequenceNumber" INTEGER NOT NULL,
    "category" "QuestionCategory" NOT NULL,
    "questionText" TEXT NOT NULL,
    "userAnswer" TEXT,
    "aiFollowUp" TEXT,
    "llmAnnotation" TEXT,
    "askedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "answeredAt" TIMESTAMP(3),
    "answerDuration" INTEGER,

    CONSTRAINT "interview_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_reports" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'PENDING',
    "overallScore" DECIMAL(4,2),
    "technicalScore" DECIMAL(4,2),
    "communicationScore" DECIMAL(4,2),
    "pacingScore" DECIMAL(4,2),
    "codeQualityScore" DECIMAL(4,2),
    "behavioralScore" DECIMAL(4,2),
    "strengths" JSONB,
    "improvements" JSONB,
    "questionFeedback" JSONB,
    "fullTranscript" JSONB,
    "rawLlmResponse" TEXT,
    "processingStartedAt" TIMESTAMP(3),
    "processingEndedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_email_idx" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_tokenHash_idx" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE UNIQUE INDEX "resumes_userId_key" ON "resumes"("userId");

-- CreateIndex
CREATE INDEX "resumes_userId_idx" ON "resumes"("userId");

-- CreateIndex
CREATE INDEX "interview_sessions_userId_idx" ON "interview_sessions"("userId");

-- CreateIndex
CREATE INDEX "interview_sessions_userId_status_idx" ON "interview_sessions"("userId", "status");

-- CreateIndex
CREATE INDEX "interview_sessions_userId_createdAt_idx" ON "interview_sessions"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "interview_sessions_status_idx" ON "interview_sessions"("status");

-- CreateIndex
CREATE INDEX "interview_questions_sessionId_idx" ON "interview_questions"("sessionId");

-- CreateIndex
CREATE INDEX "interview_questions_category_idx" ON "interview_questions"("category");

-- CreateIndex
CREATE UNIQUE INDEX "interview_questions_sessionId_sequenceNumber_key" ON "interview_questions"("sessionId", "sequenceNumber");

-- CreateIndex
CREATE UNIQUE INDEX "feedback_reports_sessionId_key" ON "feedback_reports"("sessionId");

-- CreateIndex
CREATE INDEX "feedback_reports_sessionId_idx" ON "feedback_reports"("sessionId");

-- CreateIndex
CREATE INDEX "feedback_reports_status_idx" ON "feedback_reports"("status");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt" DESC);

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resumes" ADD CONSTRAINT "resumes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_sessions" ADD CONSTRAINT "interview_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "interview_questions" ADD CONSTRAINT "interview_questions_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedback_reports" ADD CONSTRAINT "feedback_reports_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "interview_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
