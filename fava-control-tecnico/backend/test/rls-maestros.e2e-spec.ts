/**
 * RLS de los maestros y catalogos de la Fase 2: LEER todos, ESCRIBIR solo admin.
 *
 * Todo lo que se afirma aqui se afirma conectado como `fava_app` (appClient), el rol
 * real de la app: NOBYPASSRLS y no dueno de las tablas. Con el owner las politicas
 * quedan escritas y sin ningun efecto y la suite pasaria por el motivo equivocado.
 *
 * El caso de LECTURA compara el conteo del tecnico con el del owner en vez de pedir
 * «> 0»: una tabla con RLS habilitado y sin politica de SELECT no da error, da CERO
 * filas, y ese es el fallo silencioso que hay que poder detectar.
 *
 * Los SQLSTATE se afirman por codigo (42501, 22P02) y nunca por texto: este cluster
 * responde en espanol.
 */
import {
  CUR_TEST,
  MAQ_TEST,
  ROL_TEST,
  TEC_A,
  appClient,
  disconnectAll,
  ownerClient,
  truncateAll,
} from './helpers/db';
import { crearProyecto } from './helpers/fixtures';

/** Segundo modelo de maquina, para que el INSERT en project_machines no choque con la siembra. */
const MAQ_EXTRA = '55555555-5555-4555-8555-555555555555';

/** Lo que hace RlsInterceptor en cada peticion de un tecnico, reducido a lo esencial. */
function comoTecnico<T>(fn: (tx: typeof appClient) => Promise<T>): Promise<T> {
  return appClient.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.is_admin', 'off', TRUE),
      set_config('app.technician_id', ${TEC_A}, TRUE)`;
    return fn(tx as typeof appClient);
  });
}

/**
 * Escritura de admin verificada y DESHECHA: la tx termina en rollback a proposito.
 *
 * Asi el caso prueba el PERMISO sin dejar rastro. Importa porque los catalogos NO se
 * truncan entre tests (los 8 conceptos los sembro la migracion): una escritura que
 * persistiese dejaria la base distinta para la suite siguiente y para la segunda
 * pasada de esta.
 *
 * `technician_id` va VACIO a proposito: es el caso que revienta si alguien copia un
 * `::uuid` sin NULLIF (heredado de 01-02).
 *
 * Varias sentencias van en la MISMA transaccion (el DELETE tiene que ver la fila que
 * acaba de poner el INSERT) y se mide la ultima.
 */
async function comoAdmin(...sqls: string[]): Promise<number> {
  const CENTINELA = 'ROLLBACK_A_PROPOSITO';
  let filas = -1;
  await appClient
    .$transaction(async (tx) => {
      await tx.$executeRaw`SELECT
        set_config('app.is_admin', 'on', TRUE),
        set_config('app.technician_id', '', TRUE)`;
      for (const sql of sqls) filas = await tx.$executeRawUnsafe(sql);
      throw new Error(CENTINELA);
    })
    .catch((e: unknown) => {
      if (!String(e).includes(CENTINELA)) throw e;
    });
  return filas;
}

function contar(db: typeof appClient, tabla: string): Promise<number> {
  return db
    .$queryRawUnsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM "${tabla}"`)
    .then((r) => r[0].n);
}

const TABLAS = [
  'concepts',
  'role_types',
  'currencies',
  'machine_models',
  'technicians',
  'projects',
  'project_machines',
  'project_sold_days',
] as const;

type Tabla = (typeof TABLAS)[number];

/**
 * Una sentencia de escritura por tabla.
 *
 * `insert` usa claves que no colisionan con lo sembrado, salvo en `concepts`: el enum
 * tiene EXACTAMENTE 8 valores y los 8 estan sembrados, asi que un «9º concepto» no se
 * puede ni nombrar (ver el caso del enum). Se intenta con un codigo existente, y aun asi
 * el error es 42501 y no 23505: la politica se evalua antes del unique (comprobado).
 *
 * `update` va con WHERE y sobre una columna sin unique: un UPDATE a pelo sobre
 * `role_types.name` chocaria con su propio @unique y el fallo no diria nada de RLS.
 *
 * `borrar` retira exactamente la fila que puso `insert`. Un DELETE a pelo sobre
 * `role_types` chocaria con el FK de `technicians`, que tampoco es lo que se prueba.
 */
const SQL: Record<Tabla, { insert: string; update: string; borrar: string }> = {
  concepts: {
    insert: `INSERT INTO "concepts" ("code","label_es","label_it","sort_order","updated_at")
             VALUES ('DC','colado','colado',99,now())`,
    update: `UPDATE "concepts" SET "label_es" = 'editado' WHERE "code" = 'DC'`,
    borrar: `DELETE FROM "concepts" WHERE "code" = 'DC'`,
  },
  role_types: {
    insert: `INSERT INTO "role_types" ("id","name") VALUES (gen_random_uuid(),'Rol colado')`,
    update: `UPDATE "role_types" SET "is_active" = FALSE WHERE "id" = '${ROL_TEST}'`,
    borrar: `DELETE FROM "role_types" WHERE "name" = 'Rol colado'`,
  },
  currencies: {
    insert: `INSERT INTO "currencies" ("code","symbol") VALUES ('ZZZ','Z')`,
    update: `UPDATE "currencies" SET "symbol" = 'X' WHERE "code" = '${CUR_TEST}'`,
    borrar: `DELETE FROM "currencies" WHERE "code" = 'ZZZ'`,
  },
  machine_models: {
    insert: `INSERT INTO "machine_models" ("id","code") VALUES (gen_random_uuid(),'MAQ-COLADA')`,
    update: `UPDATE "machine_models" SET "description" = 'editada' WHERE "id" = '${MAQ_TEST}'`,
    borrar: `DELETE FROM "machine_models" WHERE "code" = 'MAQ-COLADA'`,
  },
  technicians: {
    insert: `INSERT INTO "technicians" ("id","full_name","role_type_id","employment_type","updated_at")
             VALUES (gen_random_uuid(),'Colado','${ROL_TEST}','INTERNO',now())`,
    update: `UPDATE "technicians" SET "full_name" = 'editado' WHERE "id" = '${TEC_A}'`,
    borrar: `DELETE FROM "technicians" WHERE "full_name" = 'Colado'`,
  },
  projects: {
    insert: `INSERT INTO "projects"
               ("id","name","client_name","locality","country","supply","contract_number","updated_at")
             VALUES (gen_random_uuid(),'Colado','Cliente colado','Bogota','Colombia','Electrica','999',now())`,
    update: `UPDATE "projects" SET "supply" = 'editado' WHERE "name" <> 'Colado'`,
    borrar: `DELETE FROM "projects" WHERE "name" = 'Colado'`,
  },
  project_machines: {
    // Se rellena en beforeEach con el id del proyecto sembrado.
    insert: '',
    update: '',
    borrar: `DELETE FROM "project_machines" WHERE "machine_model_id" = '${MAQ_EXTRA}'`,
  },
  project_sold_days: {
    insert: '',
    update: '',
    borrar: `DELETE FROM "project_sold_days" WHERE "phase" = 'COLLAUDO'`,
  },
};

describe('RLS: maestros y catalogos leidos por todos, escritos solo por admin', () => {
  beforeEach(async () => {
    // Deja los 4 catalogos garantizados, las transaccionales vacias y TEC_A/TEC_B
    // existiendo como filas reales de technicians.
    await truncateAll();

    await ownerClient.machineModel.upsert({
      where: { id: MAQ_EXTRA },
      update: {},
      create: { id: MAQ_EXTRA, code: 'TEST-MAQ-2' },
    });

    const proyecto = await crearProyecto();
    await ownerClient.projectMachine.create({
      data: { projectId: proyecto.id, machineModelId: MAQ_TEST },
    });
    await ownerClient.projectSoldDays.create({
      data: { projectId: proyecto.id, roleTypeId: ROL_TEST, phase: 'MONTAJE', soldDays: 10 },
    });

    SQL.project_machines.insert = `INSERT INTO "project_machines" ("project_id","machine_model_id")
      VALUES ('${proyecto.id}','${MAQ_EXTRA}')`;
    SQL.project_machines.update = `UPDATE "project_machines" SET "machine_model_id" = "machine_model_id"
      WHERE "project_id" = '${proyecto.id}'`;
    SQL.project_sold_days.insert = `INSERT INTO "project_sold_days"
        ("id","project_id","role_type_id","phase","sold_days","updated_at")
      VALUES (gen_random_uuid(),'${proyecto.id}','${ROL_TEST}','COLLAUDO',7,now())`;
    SQL.project_sold_days.update = `UPDATE "project_sold_days" SET "sold_days" = 99
      WHERE "project_id" = '${proyecto.id}'`;
  });

  afterAll(async () => {
    await disconnectAll();
  });

  describe('control anti-mentira (sin esto, RLS apagado seria indistinguible de RLS funcionando)', () => {
    it('las 8 tablas nuevas tienen RLS habilitado Y forzado', async () => {
      const filas = await appClient.$queryRaw<
        { relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean }[]
      >`SELECT relname, relrowsecurity, relforcerowsecurity
          FROM pg_class
         WHERE relkind = 'r' AND relname = ANY(${[...TABLAS]}::text[])
         ORDER BY relname`;

      expect(filas).toHaveLength(TABLAS.length);
      expect(filas.filter((f) => f.relrowsecurity && f.relforcerowsecurity)).toHaveLength(
        TABLAS.length,
      );
    });

    it('el rol de la suite es fava_app dentro de la transaccion de prueba', async () => {
      const usuario = await comoTecnico(async (tx) => {
        const [{ usuario }] = await tx.$queryRaw<{ usuario: string }[]>`
          SELECT current_user AS usuario`;
        return usuario;
      });
      expect(usuario).toBe('fava_app');
    });

    it('concepts NO tiene politica de INSERT ni de DELETE: solo SELECT y UPDATE', async () => {
      const filas = await appClient.$queryRaw<{ cmd: string }[]>`
        SELECT cmd FROM pg_policies WHERE tablename = 'concepts' ORDER BY cmd`;

      expect(filas.map((f) => f.cmd)).toEqual(['SELECT', 'UPDATE']);
    });
  });

  describe('lectura: el tecnico (is_admin=off) ve todo lo que ve el owner', () => {
    it.each(TABLAS)('%s devuelve el mismo conteo que el owner, y no cero', async (tabla) => {
      const delOwner = await contar(ownerClient, tabla);
      expect(delOwner).toBeGreaterThan(0); // si la siembra falla, el resto no prueba nada

      const delTecnico = await comoTecnico((tx) => contar(tx, tabla));
      expect(delTecnico).toBe(delOwner);
    });
  });

  describe('escritura: el tecnico no puede tocar ninguna de las 8 tablas', () => {
    it.each(TABLAS)('INSERT en %s devuelve 42501', async (tabla) => {
      await expect(comoTecnico((tx) => tx.$executeRawUnsafe(SQL[tabla].insert))).rejects.toThrow(
        /42501/,
      );
    });

    it.each(TABLAS)('UPDATE en %s no afecta ninguna fila', async (tabla) => {
      // El default-deny filtra las filas: Postgres devuelve 0, no un error.
      const filas = await comoTecnico((tx) => tx.$executeRawUnsafe(SQL[tabla].update));
      expect(filas).toBe(0);
    });

    it.each(TABLAS)('DELETE en %s no borra nada', async (tabla) => {
      const antes = await contar(ownerClient, tabla);
      const filas = await comoTecnico((tx) => tx.$executeRawUnsafe(`DELETE FROM "${tabla}"`));

      expect(filas).toBe(0);
      expect(await contar(ownerClient, tabla)).toBe(antes);
    });
  });

  describe('escritura: el admin (is_admin=on, technician_id vacio) si puede, en los 7 maestros', () => {
    const MAESTROS = TABLAS.filter((t) => t !== 'concepts');

    it.each(MAESTROS)('INSERT en %s afecta 1 fila', async (tabla) => {
      expect(await comoAdmin(SQL[tabla].insert)).toBe(1);
    });

    it.each(MAESTROS)('UPDATE en %s afecta al menos 1 fila', async (tabla) => {
      expect(await comoAdmin(SQL[tabla].update)).toBeGreaterThan(0);
    });

    it.each(MAESTROS)('DELETE en %s retira la fila que acaba de insertar', async (tabla) => {
      expect(await comoAdmin(SQL[tabla].insert, SQL[tabla].borrar)).toBe(1);
    });
  });

  describe('concepts: el catalogo cerrado por motor (CAT-01)', () => {
    it('el admin SI puede editar las etiquetas ES/IT', async () => {
      expect(
        await comoAdmin(
          `UPDATE "concepts" SET "label_es" = 'Jornada completa', "label_it" = 'Giornata piena'
             WHERE "code" = 'DC'`,
        ),
      ).toBe(1);
    });

    it('ni el admin puede INSERTAR un concepto: no hay politica de INSERT (42501)', async () => {
      await expect(comoAdmin(SQL.concepts.insert)).rejects.toThrow(/42501/);
      expect(await contar(ownerClient, 'concepts')).toBe(8);
    });

    it('ni el admin puede BORRAR un concepto: no hay politica de DELETE (0 filas)', async () => {
      expect(await comoAdmin(SQL.concepts.borrar)).toBe(0);
      expect(await contar(ownerClient, 'concepts')).toBe(8);
    });

    it('un codigo inventado no pasa del enum: 22P02, antes incluso de llegar a RLS', async () => {
      await expect(
        comoAdmin(
          `INSERT INTO "concepts" ("code","label_es","label_it","sort_order","updated_at")
             VALUES ('XX','inventado','inventato',99,now())`,
        ),
      ).rejects.toThrow(/22P02/);
    });

    it('los 8 conceptos existen con etiqueta ES e IT, sembrados por la migracion', async () => {
      const filas = await comoTecnico((tx) =>
        tx.concept.findMany({ orderBy: { sortOrder: 'asc' } }),
      );

      expect(filas.map((c) => c.code)).toEqual([
        'DC',
        'MD',
        'DFD',
        'DVSF',
        'DVRC',
        'LR',
        'NR',
        'IL',
      ]);
      expect(filas.every((c) => c.labelEs.length > 0 && c.labelIt.length > 0)).toBe(true);
    });
  });
});
