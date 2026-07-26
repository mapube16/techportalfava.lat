# Deferred items — Fase 3

Hallazgos que NO se arreglan en esta fase, con su dueño escrito. Que estén aquí
significa que se vieron y se decidió no tocarlos, no que se olvidaran.

---

## 1. El CHECK `de_proyecto_por_concepto` es ESTRICTO — dueño: **Fase 6 (migración del Excel)**

**Encontrado en:** 03-01 T1, al crear el CHECK.

El CHECK exige proyecto para los cinco conceptos de trabajo (`DC`, `MD`, `DFD`,
`DVSF`, `DVRC`). Verificado contra el motor: un `INSERT` de `DC` sin `project_id`
devuelve **SQLSTATE 23514**, venga de un endpoint, de un script de migración o de la
consola de la base.

El Excel marca **1.438 filas** con el centinela «Sin Proyecto» y **no se ha podido
comprobar qué conceptos llevan** (no hay extracto del Excel en el repo). Si alguna
lleva uno de los cinco de trabajo, la migración del histórico **se caerá contra este
CHECK a mitad**.

**La salida es la cuarentena** (`migration_rejects`: la fila se aparta con su motivo y
la migración continúa), **NO relajar el CHECK bajo presión**. La alternativa técnica
—añadir `OR source_row IS NOT NULL` para eximir a lo importado— existe, funcionaría, y
**no se toma por adelantado**: convierte una garantía del motor en una garantía
condicional a cambio de no escribir la tabla de cuarentena que la Fase 6 necesita de
todas formas para las grafías de técnico (MIG-01).

---

## 2. `created_at` / `updated_at` son `timestamp without time zone` — dueño: **Fase 5 (Nota Semanal / expediente de firma)**

**Encontrado en:** 03-01 T1, revisando `daily_entries` en `information_schema.columns`.

Las dos marcas son `timestamp` sin zona, no `timestamptz`. **Aquí es irrelevante:** las
produce el mismo servidor y solo se comparan entre sí (la detección de conflicto del
borrador de BIT-04 compara `updatedAt` del servidor con `savedAt` del navegador, y esa
sí cruza husos — pero el `updatedAt` viaja serializado por Prisma como ISO en UTC).

**Importa en la Fase 5:** si el expediente de firma imprime un «timestamp de servidor»
como prueba de cuándo se aprobó la nota, un `timestamp` sin zona es un instante sin
referencia — legible pero no defendible. Decidir allí si se migra a `timestamptz` o si
el expediente imprime explícitamente «hora UTC».
