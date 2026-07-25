-- CreateEnum
CREATE TYPE "role" AS ENUM ('T', 'A', 'S');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "entra_oid" TEXT,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "roles" "role"[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "technician_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "access_requests" (
    "id" UUID NOT NULL,
    "entra_oid" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "daily_entries" (
    "id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source_year" INTEGER,
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "daily_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "weekly_notes" (
    "id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "week_start" DATE NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "source_year" INTEGER,
    "source_sheet" TEXT,
    "source_row" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "weekly_notes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_entra_oid_key" ON "users"("entra_oid");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "access_requests_entra_oid_key" ON "access_requests"("entra_oid");

-- CreateIndex
CREATE UNIQUE INDEX "daily_entries_technician_id_date_key" ON "daily_entries"("technician_id", "date");

-- CreateIndex
CREATE INDEX "weekly_notes_technician_id_idx" ON "weekly_notes"("technician_id");
