/**
 * El cron de los avisos (Fase 9). Corre cada 5 minutos como servicio aparte en Railway.
 *
 *   npm -w backend run notificar
 *   npm -w backend run notificar -- --dry                 (no escribe ni envia nada)
 *   npm -w backend run notificar -- --dry --ventana=vie   (fuerza la ventana, sin esperar al viernes)
 *
 * Hace dos cosas en cada tic: ENCOLA lo que toque segun la hora, y DRENA lo pendiente.
 * Un solo servicio y no tres crons porque el drenado necesita un tic frecuente de todas
 * formas; anadir dos entradas mas seria mas infraestructura, no menos.
 *
 * Este archivo es SOLO cableado: toda la aritmetica de fechas vive en
 * `src/common/notifications/reloj.ts` y en `modules/daily-entries/fecha.ts`, que es
 * donde el guarda-rail `scripts/check-fecha-servidor.mjs` la vigila.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { env } from '../src/config/env';
import { encolarEn } from '../src/common/notifications/notifications.service';
import { enviarCorreo } from '../src/common/notifications/graph';
import { momento } from '../src/common/notifications/reloj';
import {
  avisosResumenAdmins,
  avisosSemanaSinEnviar,
  leerFaltantes,
} from '../src/common/notifications/recordatorios';
import { lunesDe, sumarDias } from '../src/modules/daily-entries/fecha';
import { PrismaClient } from '../src/generated/prisma/client';

const dry = process.argv.includes('--dry');
const forzada = process.argv.find((a) => a.startsWith('--ventana='))?.split('=')[1];

/**
 * DATABASE_URL y NUNCA la del owner: con el owner las politicas RLS quedan escritas y
 * sin efecto, el cron "funcionaria", y el dia que alguien tocara una politica el fallo
 * aparecia en produccion sin que ningun test lo hubiera visto.
 */
const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});

/** El actor de las escrituras del sistema. No es un usuario real y no tiene que serlo. */
const SISTEMA = '00000000-0000-4000-8000-000000000000';

/**
 * LA funcion que hace que esto no devuelva cero filas en silencio.
 *
 * `RlsInterceptor` fija las tres GUCs solo si hay `req.user`, y un cron no tiene
 * peticion. Sin repetirlas aqui, `fava_app` (NOBYPASSRLS) lee `daily_entries` con
 * `current_setting('app.is_admin', TRUE)` a NULL, la politica `de_self` no casa y el
 * groupBy sale VACIO SIN ERROR: los recordatorios se mandarian a nadie y los logs
 * dirian que todo fue bien. Es el fallo mas caro de esta fase y no da ningun sintoma.
 *
 * El tercer argumento TRUE (is_local) es el mismo del interceptor: ata el contexto a
 * esta transaccion y no a la conexion.
 */
function conContexto<T>(fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT
      set_config('app.user_id',       ${SISTEMA}, TRUE),
      set_config('app.technician_id', '',         TRUE),
      set_config('app.is_admin',      'on',       TRUE)`;
    return fn(tx as unknown as PrismaClient);
  });
}

/** Cuantas filas reclama cada tic. 50 x ~200 ms de Graph cabe de sobra en 5 minutos. */
const LOTE = 50;
/** Tras 5 intentos se marca `failed` y deja de reintentarse. */
const MAX_INTENTOS = 5;

interface Pendiente {
  id: string;
  to_email: string;
  subject: string;
  body_text: string;
  /** Fase 9b. `null` en lo encolado antes de que existiera: eso se manda como texto. */
  body_html: string | null;
  attempts: number;
}

/**
 * Reclamar y enviar.
 *
 * El HTTP va FUERA de toda transaccion: el pool es de 10 con timeout de 10 s y una
 * llamada de red dentro lo agota antes que la CPU (P2028). De ahi las tres
 * transacciones diminutas por lote con la red en medio.
 *
 * El reclamo es un solo UPDATE...RETURNING con FOR UPDATE SKIP LOCKED: dos procesos
 * solapados no se llevan la misma fila. Y recoge las que quedaron en 'sending' hace mas
 * de 15 minutos, que son las de un proceso que murio a mitad — sin eso se quedarian ahi
 * para siempre.
 */
async function drenar(): Promise<void> {
  const lote = await conContexto((tx) =>
    tx.$queryRaw<Pendiente[]>`
      UPDATE notifications SET status = 'sending', claimed_at = now()
      WHERE id IN (
        SELECT id FROM notifications
         WHERE status = 'pending'
            OR (status = 'sending' AND claimed_at < now() - interval '15 minutes')
         ORDER BY created_at
         LIMIT ${LOTE}
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, to_email, subject, body_text, body_html, attempts`,
  );

  if (!lote.length) return;
  console.log(`drenando ${lote.length} aviso(s) por ${env.NOTIF_TRANSPORT}`);

  // Secuencial a proposito: Graph estrangula, y 50 x 200 ms son 10 s.
  // ponytail: si algun dia son cientos, un limite de concurrencia de 4.
  for (const n of lote) {
    const r = await enviarCorreo({
      toEmail: n.to_email,
      subject: n.subject,
      bodyText: n.body_text,
      bodyHtml: n.body_html,
    });
    const agotado = r.permanente || n.attempts + 1 >= MAX_INTENTOS;
    await conContexto((tx) =>
      tx.notification.update({
        where: { id: n.id },
        data: r.ok
          ? { status: 'sent', sentAt: new Date(), lastError: null } // fecha-ok: instante de envio
          : {
              status: agotado ? 'failed' : 'pending',
              attempts: { increment: 1 },
              lastError: r.error ?? null,
            },
      }),
    );
    if (!r.ok) console.error(`  fallo ${n.to_email}: ${r.error}`);
  }
}

/** Encola una ronda de «tu semana esta sin enviar» + su resumen si toca. */
async function encolarRonda(ronda: 'vie' | 'dom' | 'lun', hoy: string): Promise<void> {
  // El viernes y el domingo se habla de la semana EN CURSO; el lunes, de la que acaba
  // de cerrar. De ahi el -7: el lunes de hoy menos siete dias es el lunes pasado.
  const lunes = ronda === 'lun' ? sumarDias(lunesDe(hoy), -7) : lunesDe(hoy);

  const f = await conContexto((tx) => leerFaltantes(tx, lunes));
  console.log(
    `semana ${lunes}: ${f.avisables.length} sin enviar avisables, ` +
      `${f.inalcanzables.length} sin correo`,
  );

  if (dry) {
    for (const t of f.avisables) console.log(`  avisaria a ${t.fullName} <${t.user?.email}>`);
    for (const t of f.inalcanzables) console.log(`  SIN CORREO: ${t.fullName}`);
    return;
  }

  const avisos =
    ronda === 'lun'
      ? await conContexto((tx) => avisosResumenAdmins(tx, f, lunes))
      : avisosSemanaSinEnviar(f, lunes, ronda);

  const n = await conContexto((tx) => encolarEn(tx, avisos));
  console.log(`  encolados ${n} (de ${avisos.length}; el resto ya estaban)`);
}

async function main(): Promise<void> {
  const { dow, hora, fechaLocal } = momento();
  console.log(`${fechaLocal} dow=${dow} hora=${hora} (${env.NOTIF_TZ})`);

  // Ventanas de UNA HORA, no de un instante: si un tic se pierde o el deploy tarda, el
  // siguiente lo recoge. Evaluarlas doce veces por hora es inofensivo — la `dedupe_key`
  // absorbe las repeticiones en el motor, que es donde no se puede olvidar.
  if (forzada === 'vie' || (!forzada && dow === 5 && hora === 16)) await encolarRonda('vie', fechaLocal);
  if (forzada === 'dom' || (!forzada && dow === 7 && hora === 12)) await encolarRonda('dom', fechaLocal);
  if (forzada === 'lun' || (!forzada && dow === 1 && hora === 8)) await encolarRonda('lun', fechaLocal);

  if (!dry) await drenar();
}

main()
  .catch((e) => {
    console.error('notificar:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
