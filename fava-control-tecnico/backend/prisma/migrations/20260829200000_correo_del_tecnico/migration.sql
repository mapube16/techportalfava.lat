-- CAT-02b — el correo pasa a ser del TECNICO, no solo de su cuenta.
--
-- POR QUE. Una ficha de tecnico guardaba nombre, cargo, vinculo y poco mas: todo lo
-- demas que se ve en la pantalla es historia derivada, asi que un recien llegado salia
-- como un cascaron. Y el correo -- lo unico que FAVA tiene de verdad de una persona
-- nueva -- vivia en `users`, o sea SOLO si ya tenia cuenta de la aplicacion. Un tecnico
-- sin cuenta no era contactable por ningun medio: `ZZ DEMO Ana Rossi` es exactamente
-- ese caso hoy.
--
-- Un tecnico existe como PERSONA antes que como usuario. El correo va con la persona.
--
-- NO SUSTITUYE a `users.email`, que es la identidad de Entra con la que se entra. Son
-- dos cosas distintas que casi siempre coinciden, y esa coincidencia es justo lo que
-- permite unir las dos fichas solas en vez de a mano.

ALTER TABLE "technicians" ADD COLUMN "email" TEXT;

-- Se rellena desde la cuenta vinculada, que es donde estaba el dato.
--
-- MENOS LOS `@pendiente.invalid`: son los que invento `crear-usuarios-tecnicos.ts`
-- para los tecnicos historicos que nunca tuvieron correo. Copiarlos aqui convertiria
-- un hueco reconocible en un dato que parece bueno, y el filtro de alcanzables de las
-- notificaciones dejaria de verlos. Un vacio honesto vale mas que un relleno falso.
UPDATE "technicians" t
   SET "email" = u."email"
  FROM "users" u
 WHERE u."technician_id" = t."id"
   AND u."email" NOT LIKE '%@pendiente.invalid';

-- Unico y sin distinguir mayusculas: `A.Scapin@` y `ascapin@` son la misma persona, y
-- el vinculo automatico por correo se romperia en silencio con dos filas que el motor
-- considera distintas y una persona no.
CREATE UNIQUE INDEX "technicians_email_key" ON "technicians" (lower("email"));

-- La columna es del maestro y el maestro lo gobiernan A y S; `fava_app` ya tiene
-- SELECT/INSERT/UPDATE sobre la tabla, asi que no hace falta GRANT nuevo. Las
-- politicas de `technicians` tampoco cambian: filtran por fila, no por columna.
