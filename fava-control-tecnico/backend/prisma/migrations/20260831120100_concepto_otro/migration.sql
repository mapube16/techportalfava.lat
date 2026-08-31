-- «Otro», segunda parte: donde el valor ya se puede usar (ver la migracion anterior).
--
-- Va SIN proyecto, como LR/NR/IL: es el cajon de lo no imputable a una obra. La
-- exigencia de descripcion vive en la capa de servicio (OTRO_SIN_DESCRIPCION), no
-- aqui: el mismo criterio que dejo a `phase` fuera del CHECK en 03-01.
ALTER TABLE "daily_entries" DROP CONSTRAINT IF EXISTS de_proyecto_por_concepto;
ALTER TABLE "daily_entries" ADD CONSTRAINT de_proyecto_por_concepto CHECK (
  concept_code IS NULL
  OR concept_code IN ('LR','NR','IL','OTRO')
  OR project_id IS NOT NULL
);

-- La fila del catalogo: con ella la cuadricula de KPIs (que arma sus columnas desde
-- `concepts`) y el cajon de captura lo ensenan solos. Ultimo en el orden: es el cajon
-- residual y delante taparia los conceptos que si dicen algo.
INSERT INTO concepts (code, label_es, label_it, sort_order, updated_at)
VALUES ('OTRO', 'Otro', 'Altro', 9, now())
ON CONFLICT (code) DO NOTHING;
