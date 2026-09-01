-- Unificar los cargos: 23 grafias para 8 oficios reales.
--
-- POR QUE NO ES COSMETICO. La matriz vendido/ejecutado cruza por (proyecto, cargo). Con
-- las grafias separadas, de 73 combinaciones proyecto+cargo SOLO UNA cruzaba las dos
-- mitades — y era la del proyecto de demostracion. En Lucchetti se vendio «Meccanico»
-- (200 dias) y se ejecuto «Mecanico» (63): el mismo oficio con dos grafias, asi que la
-- pantalla pintaba dos filas huerfanas en vez de una comparacion. El numero con el que
-- se negocia no comparaba nada.
--
-- El canonico es la grafia del lado VENDIDO (la de la cotizacion italiana): es el lado
-- que llega de la casa matriz y el que no se puede reescribir a la ligera.
--
-- NO SE BORRA NADA. Las filas historicas se reasignan al canonico y los duplicados
-- quedan DESACTIVADOS, no eliminados: un cargo con jornadas detras es historia, y
-- ademas `technicians.role_type_id` es ON DELETE RESTRICT. Desactivar los saca de los
-- formularios nuevos y deja el rastro.
--
-- Meccatronico, Tecnologo y Tecnico se quedan COMO CARGOS PROPIOS: son oficios que
-- pueden facturarse distinto y meterlos en «Meccanico» mezclaria 1.113 dias sobre una
-- suposicion. «Test -» solo tiene dias vendidos de una prueba: se desactiva.
--
-- El mapa se repite en cada sentencia como CTE y no como tabla temporal: Prisma ejecuta
-- cada sentencia por separado y una TEMP TABLE no sobrevive entre ellas (verificado:
-- 42P01 en la segunda). Repetirlo es feo y es correcto; lo alternativo es un DO $$ que
-- esconde la logica en una cadena.

-- El canonico tiene que existir aunque hoy solo aparezca en el lado vendido.
INSERT INTO role_types (id, name, is_active)
SELECT gen_random_uuid(), c.canonico, TRUE
  FROM (VALUES ('Meccanico'), ('Elettricista'), ('Software'), ('Supervisore')) AS c(canonico)
 WHERE NOT EXISTS (SELECT 1 FROM role_types rt WHERE rt.name = c.canonico);

-- Las cuatro tablas que apuntan a un cargo. `weekly_notes` incluida: es el cargo impreso
-- en la Nota, y dejarlo apuntando a una grafia desactivada haria que el PDF de una nota
-- vieja imprimiera un cargo que ya no esta en el catalogo.
UPDATE daily_entries de SET role_type_id = nuevo.id
  FROM role_types viejo
  JOIN (VALUES
    ('Mecanico','Meccanico'), ('Mecánico','Meccanico'), ('Auto Meccanico','Meccanico'),
    ('Eletrico','Elettricista'), ('Electrico','Elettricista'), ('Eléctrico','Elettricista'),
    ('Elettrico','Elettricista'), ('Electtricista','Elettricista'),
    ('Técnico Eléctrico','Elettricista'), ('Eléctrico Senior','Elettricista'),
    ('Capo Elettricista','Elettricista'), ('ElectroMecanico','Elettricista'),
    ('Sofware','Software'), ('Manager Cantiere','Supervisore')
  ) AS m(alias, canonico) ON m.alias = viejo.name
  JOIN role_types nuevo ON nuevo.name = m.canonico
 WHERE de.role_type_id = viejo.id;

-- OJO: order_sold_days tiene UNIQUE(order_id, role_type_id, phase). Si una orden
-- vendiera «Meccanico» Y «Mecanico» en la misma fase, este UPDATE chocaria y la
-- migracion se detendria — que es lo correcto: fusionar dos lineas vendidas es sumar
-- dias contratados, y eso lo decide una persona, no un script. Hoy no se solapan.
UPDATE order_sold_days sd SET role_type_id = nuevo.id
  FROM role_types viejo
  JOIN (VALUES
    ('Mecanico','Meccanico'), ('Mecánico','Meccanico'), ('Auto Meccanico','Meccanico'),
    ('Eletrico','Elettricista'), ('Electrico','Elettricista'), ('Eléctrico','Elettricista'),
    ('Elettrico','Elettricista'), ('Electtricista','Elettricista'),
    ('Técnico Eléctrico','Elettricista'), ('Eléctrico Senior','Elettricista'),
    ('Capo Elettricista','Elettricista'), ('ElectroMecanico','Elettricista'),
    ('Sofware','Software'), ('Manager Cantiere','Supervisore')
  ) AS m(alias, canonico) ON m.alias = viejo.name
  JOIN role_types nuevo ON nuevo.name = m.canonico
 WHERE sd.role_type_id = viejo.id;

UPDATE weekly_notes wn SET role_type_id = nuevo.id
  FROM role_types viejo
  JOIN (VALUES
    ('Mecanico','Meccanico'), ('Mecánico','Meccanico'), ('Auto Meccanico','Meccanico'),
    ('Eletrico','Elettricista'), ('Electrico','Elettricista'), ('Eléctrico','Elettricista'),
    ('Elettrico','Elettricista'), ('Electtricista','Elettricista'),
    ('Técnico Eléctrico','Elettricista'), ('Eléctrico Senior','Elettricista'),
    ('Capo Elettricista','Elettricista'), ('ElectroMecanico','Elettricista'),
    ('Sofware','Software'), ('Manager Cantiere','Supervisore')
  ) AS m(alias, canonico) ON m.alias = viejo.name
  JOIN role_types nuevo ON nuevo.name = m.canonico
 WHERE wn.role_type_id = viejo.id;

UPDATE technicians t SET role_type_id = nuevo.id
  FROM role_types viejo
  JOIN (VALUES
    ('Mecanico','Meccanico'), ('Mecánico','Meccanico'), ('Auto Meccanico','Meccanico'),
    ('Eletrico','Elettricista'), ('Electrico','Elettricista'), ('Eléctrico','Elettricista'),
    ('Elettrico','Elettricista'), ('Electtricista','Elettricista'),
    ('Técnico Eléctrico','Elettricista'), ('Eléctrico Senior','Elettricista'),
    ('Capo Elettricista','Elettricista'), ('ElectroMecanico','Elettricista'),
    ('Sofware','Software'), ('Manager Cantiere','Supervisore')
  ) AS m(alias, canonico) ON m.alias = viejo.name
  JOIN role_types nuevo ON nuevo.name = m.canonico
 WHERE t.role_type_id = viejo.id;

-- Los duplicados y la prueba salen del catalogo. Desactivar, nunca borrar.
UPDATE role_types SET is_active = FALSE
 WHERE name IN (
   'Mecanico', 'Mecánico', 'Auto Meccanico',
   'Eletrico', 'Electrico', 'Eléctrico', 'Elettrico', 'Electtricista',
   'Técnico Eléctrico', 'Eléctrico Senior', 'Capo Elettricista', 'ElectroMecanico',
   'Sofware', 'Manager Cantiere', 'Test -'
 );
