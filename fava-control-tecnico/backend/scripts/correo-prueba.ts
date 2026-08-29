/**
 * Encola UNO de cada aviso a un buzon, para verlos en un cliente de correo de verdad.
 *
 *     npm -w backend run correo:prueba                    # a NOTIF_FROM
 *     npm -w backend run correo:prueba -- alguien@fava.com
 *     npm -w backend run correo:prueba -- --lang=it
 *
 * POR QUE EXISTE. La vista previa en el navegador miente por omision: Outlook usa el
 * motor de Word, Gmail reescribe el CSS, el movil aplica su propio zoom y el modo
 * oscuro invierte cosas por su cuenta. Ninguna de esas cuatro se puede comprobar sin
 * mandar el correo y abrirlo donde lo va a abrir la gente.
 *
 * NO ENVIA: encola. El cron (`notificar.ts`) lo recoge en su siguiente vuelta, igual
 * que cualquier otro aviso — asi lo que se prueba es el camino COMPLETO, incluido el
 * render que guarda `encolarEn` y el transporte. Un script que llamara a Graph por su
 * cuenta probaria una tuberia que no existe.
 *
 * Los datos de ejemplo son de verdad —proyecto y tecnicos reales— porque un correo con
 * «Proyecto de prueba» no enseña como queda un nombre largo en la rejilla.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { env } from '../src/config/env';
import { encolarEn } from '../src/common/notifications/notifications.service';
import { LANGS, type Kind, type Lang } from '../src/common/notifications/plantillas';

const KINDS: Kind[] = ['invitacion', 'note_returned', 'note_approved', 'week_missing', 'admin_digest'];

/** Lo que cada plantilla necesita. Uno solo para los cinco: sobra lo que no usan. */
const DATOS = {
  proyecto: 'MOLINO CIBAO BOCEL - RD',
  semana: '2026-08-24',
  comentario: 'Falta la descripción del martes y la máquina del jueves.',
  lista: ['Fredy Sarmiento', 'Ivan Cortes', 'Leomar Klein'],
  inalcanzables: ['Diego Bautista', 'Marco Bosi'],
  invitadoPor: 'Andrea Scapin',
};

async function main() {
  const args = process.argv.slice(2);
  const lang = (args.find((a) => a.startsWith('--lang='))?.slice(7) ?? 'es') as Lang;
  if (!LANGS.includes(lang)) throw new Error(`idioma no valido: ${lang}`);

  const destino = args.find((a) => !a.startsWith('--')) ?? env.NOTIF_FROM;
  if (!destino) throw new Error('sin destino: pasa un correo o define NOTIF_FROM');

  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL }),
  });

  try {
    // El usuario del buzon, si existe: asi el aviso queda atado a alguien y no huerfano.
    const u = await prisma.user.findFirst({
      where: { email: { equals: destino, mode: 'insensitive' } },
      select: { id: true, displayName: true },
    });

    // fecha-ok: es un INSTANTE y hace unicas las claves, para que dos pasadas seguidas
    // manden dos tandas en vez de chocar con el dedupe.
    const marca = new Date().toISOString();

    const n = await encolarEn(
      prisma,
      KINDS.map((kind) => ({
        kind,
        dedupeKey: `prueba:${kind}:${marca}`,
        para: {
          userId: u?.id ?? null,
          email: destino,
          displayName: u?.displayName ?? 'Equipo FAVA',
          lang,
        },
        datos: { ...DATOS, enlace: env.APP_BASE_URL },
        entity: 'prueba',
      })),
    );

    console.log(`encolados ${n}/${KINDS.length} avisos en ${lang} para ${destino}`);
    console.log(`transporte: ${env.NOTIF_TRANSPORT}`);
    if (env.NOTIF_TRANSPORT === 'console') {
      console.log('OJO: con `console` no sale ningun correo, solo se imprimen en el cron.');
    } else {
      console.log('El cron los recoge en su siguiente vuelta (cada 5 minutos).');
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error('correo-prueba:', e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
