-- «Otro»: lo que no cabe en ninguno de los 8 conceptos (capacitacion, tramites…).
-- Peticion de Andrea (2026-08-31).
--
-- SOLO el valor del enum, y en su propia migracion a proposito: Postgres prohibe USAR
-- un valor nuevo de enum en la misma transaccion que lo crea, y Prisma envuelve cada
-- migracion en una. El CHECK y la fila del catalogo que lo usan van en la siguiente.
ALTER TYPE "concept_code" ADD VALUE 'OTRO';
