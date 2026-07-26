-- CreateEnum
CREATE TYPE "concept_code" AS ENUM ('DC', 'MD', 'DFD', 'DVSF', 'DVRC', 'LR', 'NR', 'IL');

-- CreateEnum
CREATE TYPE "phase" AS ENUM ('MONTAJE', 'COLLAUDO');

-- CreateEnum
CREATE TYPE "employment_type" AS ENUM ('INTERNO', 'EXTERNO');

-- AlterTable
ALTER TABLE "daily_entries" ADD COLUMN     "concept_code" "concept_code",
ADD COLUMN     "machine_model_id" UUID,
ADD COLUMN     "phase" "phase",
ADD COLUMN     "project_id" UUID,
ADD COLUMN     "role_type_id" UUID;

-- CreateTable
CREATE TABLE "concepts" (
    "code" "concept_code" NOT NULL,
    "label_es" TEXT NOT NULL,
    "label_it" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "role_types" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "role_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "machine_models" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "description" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "machine_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "technicians" (
    "id" UUID NOT NULL,
    "full_name" TEXT NOT NULL,
    "role_type_id" UUID NOT NULL,
    "employment_type" "employment_type" NOT NULL,
    "aliases" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "technicians_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "client_name" TEXT NOT NULL,
    "client_nit" TEXT,
    "locality" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "supply" TEXT NOT NULL,
    "contract_number" TEXT NOT NULL,
    "oa_number" TEXT,
    "contract_value" DECIMAL(14,2),
    "currency_code" TEXT,
    "normal_hours" INTEGER,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_machines" (
    "project_id" UUID NOT NULL,
    "machine_model_id" UUID NOT NULL,

    CONSTRAINT "project_machines_pkey" PRIMARY KEY ("project_id","machine_model_id")
);

-- CreateTable
CREATE TABLE "project_sold_days" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "role_type_id" UUID NOT NULL,
    "phase" "phase" NOT NULL,
    "sold_days" INTEGER NOT NULL,
    "updated_by_id" UUID,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "project_sold_days_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "role_types_name_key" ON "role_types"("name");

-- CreateIndex
CREATE UNIQUE INDEX "machine_models_code_key" ON "machine_models"("code");

-- CreateIndex
CREATE INDEX "technicians_is_active_idx" ON "technicians"("is_active");

-- CreateIndex
CREATE INDEX "projects_is_active_idx" ON "projects"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "project_sold_days_project_id_role_type_id_phase_key" ON "project_sold_days"("project_id", "role_type_id", "phase");

-- CreateIndex
CREATE UNIQUE INDEX "users_technician_id_key" ON "users"("technician_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_machine_model_id_fkey" FOREIGN KEY ("machine_model_id") REFERENCES "machine_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_entries" ADD CONSTRAINT "daily_entries_role_type_id_fkey" FOREIGN KEY ("role_type_id") REFERENCES "role_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "weekly_notes" ADD CONSTRAINT "weekly_notes_technician_id_fkey" FOREIGN KEY ("technician_id") REFERENCES "technicians"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "technicians" ADD CONSTRAINT "technicians_role_type_id_fkey" FOREIGN KEY ("role_type_id") REFERENCES "role_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_machines" ADD CONSTRAINT "project_machines_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_machines" ADD CONSTRAINT "project_machines_machine_model_id_fkey" FOREIGN KEY ("machine_model_id") REFERENCES "machine_models"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sold_days" ADD CONSTRAINT "project_sold_days_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_sold_days" ADD CONSTRAINT "project_sold_days_role_type_id_fkey" FOREIGN KEY ("role_type_id") REFERENCES "role_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
