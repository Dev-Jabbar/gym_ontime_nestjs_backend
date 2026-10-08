-- Proof-of-concept DDL matching prisma/schema.prisma.
-- This is NOT what `prisma migrate dev` will generate verbatim on your
-- machine (Prisma has its own naming/formatting conventions) — this is
-- just here to prove the shape of the schema is sound against a real
-- Postgres instance, since prisma's own CLI can't run in this sandbox.

CREATE TYPE "Role" AS ENUM ('member', 'trainer', 'admin');
CREATE TYPE "Gender" AS ENUM ('male', 'female', 'prefer_not_to_say');
CREATE TYPE "FitnessGoal" AS ENUM ('weight_loss','muscle_gain','endurance','flexibility','general_fitness');
CREATE TYPE "Recurrence" AS ENUM ('none','daily','weekly','monthly');
CREATE TYPE "DayOfWeek" AS ENUM ('monday','tuesday','wednesday','thursday','friday','saturday','sunday');
CREATE TYPE "PaymentProvider" AS ENUM ('stripe','paystack');
CREATE TYPE "PaymentStatus" AS ENUM ('pending','completed','failed');
CREATE TYPE "PaymentType" AS ENUM ('one_time','subscription');
CREATE TYPE "SubscriptionInterval" AS ENUM ('weekly','monthly','threeMonths');
CREATE TYPE "SubscriptionStatus" AS ENUM ('active','expired','cancelled');

CREATE TABLE "User" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  role "Role" NOT NULL DEFAULT 'member',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "deletedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ON "User" ("isActive");

CREATE TABLE "MemberProfile" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL UNIQUE REFERENCES "User"(id),
  avatar TEXT, phone TEXT, "dateOfBirth" TIMESTAMP,
  gender "Gender", "fitnessGoal" "FitnessGoal", "healthNotes" TEXT,
  "emergencyContactName" TEXT, "emergencyContactPhone" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "TrainerProfile" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL UNIQUE REFERENCES "User"(id),
  avatar TEXT, bio TEXT, specialty TEXT, phone TEXT,
  experience INT, certifications TEXT[], availability TEXT,
  "dateOfBirth" TIMESTAMP, gender "Gender",
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE "Class" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  schedule TIMESTAMP NOT NULL,
  duration INT NOT NULL DEFAULT 60,
  recurrence "Recurrence" NOT NULL DEFAULT 'none',
  "recurrenceDays" "DayOfWeek"[],
  "trainerId" UUID REFERENCES "TrainerProfile"(id),
  "pricingOneTime" DECIMAL(10,2), "pricingWeekly" DECIMAL(10,2),
  "pricingMonthly" DECIMAL(10,2), "pricingThreeMonths" DECIMAL(10,2),
  capacity INT, image TEXT, "lastReminderSentAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ON "Class" ("trainerId");

CREATE TABLE "ClassMember" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "classId" UUID NOT NULL REFERENCES "Class"(id),
  "memberProfileId" UUID NOT NULL REFERENCES "MemberProfile"(id),
  "joinedAt" TIMESTAMP NOT NULL DEFAULT now(),
  UNIQUE ("classId", "memberProfileId")
);
CREATE INDEX ON "ClassMember" ("memberProfileId");

CREATE TABLE "PendingSeat" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "classId" UUID NOT NULL REFERENCES "Class"(id),
  "memberProfileId" UUID NOT NULL REFERENCES "MemberProfile"(id),
  "expiresAt" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ON "PendingSeat" ("classId");
CREATE INDEX ON "PendingSeat" ("expiresAt");

CREATE TABLE "Payment" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id),
  "classId" UUID REFERENCES "Class"(id),
  amount DECIMAL(10,2) NOT NULL,
  currency TEXT NOT NULL DEFAULT 'NGN',
  provider "PaymentProvider" NOT NULL DEFAULT 'paystack',
  method TEXT NOT NULL DEFAULT 'card',
  status "PaymentStatus" NOT NULL DEFAULT 'pending',
  "needsReview" BOOLEAN NOT NULL DEFAULT false,
  "paymentType" "PaymentType" NOT NULL DEFAULT 'one_time',
  "subscriptionInterval" "SubscriptionInterval",
  "stripeSessionId" TEXT UNIQUE,
  "stripePaymentIntentId" TEXT,
  "paystackReference" TEXT UNIQUE,
  "paystackAccessCode" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ON "Payment" ("userId", "createdAt");
CREATE INDEX ON "Payment" ("userId", "classId", status);
CREATE INDEX ON "Payment" ("classId", status);
CREATE INDEX ON "Payment" (status, "createdAt");
CREATE INDEX ON "Payment" ("needsReview", "createdAt");

CREATE TABLE "ClassSubscription" (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" UUID NOT NULL REFERENCES "User"(id),
  "memberProfileId" UUID NOT NULL REFERENCES "MemberProfile"(id),
  "classId" UUID NOT NULL REFERENCES "Class"(id),
  interval "SubscriptionInterval" NOT NULL,
  "startDate" TIMESTAMP NOT NULL,
  "endDate" TIMESTAMP NOT NULL,
  status "SubscriptionStatus" NOT NULL DEFAULT 'active',
  "paymentId" UUID NOT NULL UNIQUE REFERENCES "Payment"(id),
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX ON "ClassSubscription" ("userId", "classId", status);
CREATE INDEX ON "ClassSubscription" (status, "endDate");
