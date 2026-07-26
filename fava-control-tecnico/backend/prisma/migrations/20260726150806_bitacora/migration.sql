-- AlterTable
ALTER TABLE "daily_entries" ADD COLUMN     "description" TEXT;

-- ── BIT-03: el proyecto es obligatorio salvo en los conceptos que no lo tienen ──
-- Prisma no modela CHECK: se escribe a mano, como las dos migraciones de RLS.
-- Idempotente (DROP IF EXISTS + ADD) para poder re-aplicar el .sql suelto.
--
-- LR/NR/IL quedan LIBRES (pueden llevar proyecto o no). `concept_code IS NULL` se
-- admite porque la columna es nullable por diseno (Fase 6).
-- NO se exige `phase`: TODO el historico del Excel entra con phase = NULL. La fase
-- se valida en la capa de servicio para las jornadas nuevas, nunca en el motor.
ALTER TABLE "daily_entries" DROP CONSTRAINT IF EXISTS de_proyecto_por_concepto;
ALTER TABLE "daily_entries" ADD CONSTRAINT de_proyecto_por_concepto CHECK (
  concept_code IS NULL
  OR concept_code IN ('LR','NR','IL')
  OR project_id IS NOT NULL
);

-- Pitfall 7 (02-01): ALTER DEFAULT PRIVILEGES solo cubre las tablas creadas por ESE
-- rol. `daily_entries` nace en 20260725220221_init; si en Railway bootstrap y
-- migrate deploy los corre un rol distinto, la app responde `permission denied for
-- table daily_entries` justo despues de un deploy exitoso. Idempotente.
GRANT SELECT, INSERT, UPDATE, DELETE ON "daily_entries" TO fava_app;
