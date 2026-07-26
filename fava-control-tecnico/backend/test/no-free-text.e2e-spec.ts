/**
 * Criterio 4 del roadmap por INTROSPECCION: «concepto, rol y moneda solo se eligen de
 * listas cerradas — ninguno acepta texto libre en ninguna pantalla».
 *
 * Esta suite no llama a ningun endpoint ni monta la app de Nest: pregunta al catalogo
 * del sistema de Postgres. La diferencia importa. Un test de API demuestra que ESE
 * endpoint valida hoy; el catalogo del sistema demuestra que NINGUN camino de escritura
 * —endpoint nuevo, script de migracion, consola de BD o seed— puede meter un valor que
 * no este en la lista. «Sin texto libre» pasa de ser una afirmacion del summary a ser
 * una propiedad del motor.
 *
 * Corre como owner (`ownerClient`) a proposito: los catalogos del sistema no tienen RLS
 * y el rol de la app veria lo mismo, pero el owner no depende de ningun GRANT.
 *
 * NO llama a `truncateAll()`: esta suite no escribe ni una fila, y truncar seria ruido
 * para las suites que corren en paralelo.
 *
 * Todos los fallos se afirman como LISTA de strings (`expect(faltantes).toEqual([])`),
 * nunca como booleano: un test de introspeccion que solo sabe decir «expected true,
 * received false» obliga a reescribir la consulta a mano para saber que columna falta.
 *
 * Verificada en ROJO por los cuatro casos, cada uno nombrando la columna concreta:
 * anadir `['weekly_notes','project_id','projects']` a FKS_EXIGIDAS, anadir
 * `['technicians','full_name','employment_type']` a COLUMNAS_ENUM, anadir `'XX'` a
 * CONCEPTOS y anadir `'phase'` a COLUMNAS_PROHIBIDAS. El ultimo es el que mas dice:
 * con `'phase'` en la lista, la consulta devuelve `daily_entries.phase` y
 * `project_sold_days.phase`, o sea que encontraria un `delta` si alguien lo creara.
 */
import { disconnectAll, ownerClient } from './helpers/db';

/**
 * Las columnas de eleccion cerrada y la tabla que las constrine. Cada fila es una
 * garantia del criterio 4: sin su FK, la columna acepta cualquier uuid o cualquier
 * cadena de 3 letras, que es texto libre con otro nombre.
 */
const FKS_EXIGIDAS: [tabla: string, columna: string, referencia: string][] = [
  ['technicians', 'role_type_id', 'role_types'],
  ['projects', 'currency_code', 'currencies'],
  ['project_sold_days', 'project_id', 'projects'],
  ['project_sold_days', 'role_type_id', 'role_types'],
  ['daily_entries', 'project_id', 'projects'],
  ['daily_entries', 'machine_model_id', 'machine_models'],
  ['daily_entries', 'role_type_id', 'role_types'],
];

/**
 * Columnas cuyo dominio lo cierra un ENUM de Postgres, no una tabla. `data_type` tiene
 * que ser `USER-DEFINED` y `udt_name` el nombre del enum: si alguna vez alguien la
 * convierte en `text` o `character varying` con un CHECK, esto se pone rojo.
 */
const COLUMNAS_ENUM: [tabla: string, columna: string, enumEsperado: string][] = [
  ['daily_entries', 'concept_code', 'concept_code'],
  ['daily_entries', 'phase', 'phase'],
  ['project_sold_days', 'phase', 'phase'],
  ['technicians', 'employment_type', 'employment_type'],
];

/** Los 8 codigos son FIJOS y su orden es el de `sort_order` del catalogo. */
const CONCEPTOS = ['DC', 'MD', 'DFD', 'DVSF', 'DVRC', 'LR', 'NR', 'IL'];

/** Columnas que NO deben existir: el delta se calcula, no se guarda ni se digita. */
const COLUMNAS_PROHIBIDAS = ['delta', 'executed'];

afterAll(disconnectAll);

describe('Criterio 4 — ninguna eleccion cerrada acepta texto libre (introspeccion)', () => {
  it('cada columna de eleccion cerrada tiene su FOREIGN KEY', async () => {
    const filas = await ownerClient.$queryRaw<{ trio: string }[]>`
      SELECT tc.table_name || '.' || kcu.column_name || ' -> ' || ccu.table_name AS trio
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_schema = tc.constraint_schema
       AND kcu.constraint_name = tc.constraint_name
      JOIN information_schema.constraint_column_usage ccu
        ON ccu.constraint_schema = tc.constraint_schema
       AND ccu.constraint_name = tc.constraint_name
      WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`;

    const reales = new Set(filas.map((f) => f.trio));
    const faltantes = FKS_EXIGIDAS.map(([t, c, r]) => `${t}.${c} -> ${r}`).filter(
      (trio) => !reales.has(trio),
    );

    expect(faltantes).toEqual([]);
  });

  it('las columnas de dominio cerrado son enums de Postgres, no texto', async () => {
    const filas = await ownerClient.$queryRaw<
      { table_name: string; column_name: string; data_type: string; udt_name: string }[]
    >`
      SELECT table_name, column_name, data_type, udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'`;

    const porClave = new Map(
      filas.map((f) => [`${f.table_name}.${f.column_name}`, `${f.data_type}/${f.udt_name}`]),
    );
    const malas = COLUMNAS_ENUM.map(([t, c, e]) => {
      const clave = `${t}.${c}`;
      const real = porClave.get(clave) ?? 'NO EXISTE';
      return real === `USER-DEFINED/${e}` ? null : `${clave} es ${real} (esperado enum ${e})`;
    }).filter((x): x is string => x !== null);

    expect(malas).toEqual([]);
  });

  it('el enum concept_code tiene exactamente los 8 codigos fijos, en su orden', async () => {
    const filas = await ownerClient.$queryRaw<{ enumlabel: string }[]>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public' AND t.typname = 'concept_code'
      ORDER BY e.enumsortorder`;

    expect(filas.map((f) => f.enumlabel)).toEqual(CONCEPTOS);
  });

  it('no existe ninguna columna delta ni executed: el delta se calcula (criterio 3)', async () => {
    const filas = await ownerClient.$queryRaw<{ donde: string }[]>`
      SELECT table_name || '.' || column_name AS donde
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND column_name = ANY (${COLUMNAS_PROHIBIDAS})
      ORDER BY 1`;

    expect(filas.map((f) => f.donde)).toEqual([]);
  });
});
