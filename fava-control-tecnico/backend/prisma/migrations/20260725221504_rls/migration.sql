-- RLS: aislamiento por tecnico en las dos tablas de datos (AUTH-03).
--
-- Escrita a mano: Prisma no genera ni preserva politicas, y una migracion futura
-- que recree la tabla se las lleva por delante. Idempotente (DROP POLICY IF EXISTS)
-- porque `migrate dev` la corre tambien contra la shadow database.
--
-- El rol fava_app NO se crea aqui: lo crea scripts/db-bootstrap.ts. Un CREATE ROLE
-- dentro de una migracion falla la segunda vez; los roles son de cluster, asi que
-- la shadow DB ya ve el rol creado por el bootstrap.
--
-- Contexto = 3 GUCs fijadas por RlsInterceptor con set_config(..., TRUE):
--   app.user_id, app.technician_id, app.is_admin ('on' | 'off').
-- El switcher T/A/S del header cambia navegacion, nunca permisos: un Super Admin
-- en «vista Tecnico» sigue con is_admin = 'on' aqui.
--
-- Dos detalles que no son estilo:
--   * current_setting(x, TRUE)  -> missing_ok: NULL en vez de error si la GUC no existe.
--   * NULLIF(..., '')::uuid     -> un admin manda technician_id = '' y Postgres NO
--     garantiza el cortocircuito del OR: sin NULLIF el cast revienta cuando al
--     planificador le da por evaluar primero la segunda rama.
-- Sin WITH CHECK a proposito: en una politica FOR ALL, Postgres reutiliza USING como
-- WITH CHECK, asi que insertar o mover una fila al technician_id de otro ya esta vetado.

-- daily_entries
ALTER TABLE "daily_entries" ENABLE ROW LEVEL SECURITY;
-- FORCE: ni el dueno de la tabla se salta la politica (los superusuarios si, siempre).
ALTER TABLE "daily_entries" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS de_self ON "daily_entries";
CREATE POLICY de_self ON "daily_entries" FOR ALL TO fava_app
  USING (
    current_setting('app.is_admin', TRUE) = 'on'
    OR "technician_id" = NULLIF(current_setting('app.technician_id', TRUE), '')::uuid
  );

-- weekly_notes
ALTER TABLE "weekly_notes" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "weekly_notes" FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wn_self ON "weekly_notes";
CREATE POLICY wn_self ON "weekly_notes" FOR ALL TO fava_app
  USING (
    current_setting('app.is_admin', TRUE) = 'on'
    OR "technician_id" = NULLIF(current_setting('app.technician_id', TRUE), '')::uuid
  );

-- users y access_requests quedan SIN politica a proposito.
-- El guard de autenticacion busca al usuario por entra_oid ANTES de que exista
-- contexto RLS (fuera de la transaccion, con PrismaService.base): una politica sobre
-- users bloquearia el login de todo el mundo, y una sobre access_requests bloquearia
-- el endpoint publico de solicitud de acceso, que por definicion corre sin identidad
-- aprovisionada. Su aislamiento es de capa de servicio (@Roles) hasta que alguna fase
-- futura tenga un lector con contexto ya fijado que justifique la politica.
