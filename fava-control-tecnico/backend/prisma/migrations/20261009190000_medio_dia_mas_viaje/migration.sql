-- MEDIO DIA + MEDIO VIAJE (decision del usuario, 2026-10-09).
--
-- Lodi trabaja la manana y a las 17:15 sale al aeropuerto. FAVA Italia lo cuenta como
-- ½ y el viaje de la tarde no suma aparte. Con UN concepto por dia no se podia decir:
-- o era MD con el viaje escondido en la nota, o era viaje y el trabajo desaparecia.
--
-- `half_concept_code` es LA OTRA MITAD del dia. No es un modificador como `in_factory`
-- (los conceptos son de dia, no de eventualidades): es un segundo concepto de dia que
-- solo cabe cuando el principal es medio dia, y solo si es un viaje. El CHECK lo
-- garantiza en el motor, no solo en la pantalla.
--
-- El dia sigue contando UNA vez en todos los conteos, bajo MD: hoy ningun medio dia
-- vale 0,5 (ver `ejecutados` en sold-days.service.ts), y cambiar eso es otra decision.
ALTER TABLE "daily_entries" ADD COLUMN "half_concept_code" "concept_code";

ALTER TABLE "daily_entries" ADD CONSTRAINT de_media_jornada CHECK (
  half_concept_code IS NULL
  OR (concept_code = 'MD' AND half_concept_code IN ('DVSF', 'DVRC'))
);
