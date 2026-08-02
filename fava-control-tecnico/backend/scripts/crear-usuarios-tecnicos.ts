/**
 * Un usuario por técnico, para que las 443 notas del histórico tengan una persona
 * detrás en la pantalla de Usuarios mientras llegan los correos de verdad.
 *
 *     npm -w backend run usuarios:tecnicos            # aplica
 *     npm -w backend run usuarios:tecnicos -- --dry   # solo muestra, no escribe
 *
 * Corre como OWNER, igual que `crear-cuentas.ts`.
 *
 * DOS DECISIONES QUE PROTEGEN EL ACCESO, y ninguna es cosmética:
 *
 * 1. EMAIL EN `.invalid`. La columna es obligatoria y única, así que hay que poner
 *    algo. Se usa el TLD `.invalid`, que la RFC 2606 reserva para que NUNCA exista:
 *    ningún tenant de Microsoft puede tener ese dominio, así que nadie puede aparecer
 *    con ese correo y reclamar la cuenta. Un `@fava-la.com` inventado sí podría
 *    colisionar el día que IT cree esa dirección de verdad.
 *
 * 2. NACEN INACTIVOS. `isActive: false` — el guard rechaza al usuario desactivado y le
 *    enseña la pantalla de cuenta desactivada. Estas filas son un marcador con nombre,
 *    no un acceso: se activan cuando alguien ponga el correo real.
 *
 * IDEMPOTENTE por técnico. Y no pisa a nadie: si un técnico YA tiene usuario (Ivan
 * Cortes lo tiene, es el de `tecnico@fava-la.com`), se salta y lo dice.
 *
 * CÓMO SE ENGANCHA LA CUENTA REAL DESPUÉS — importante, porque hay una trampa:
 * `users.technician_id` es UNIQUE, así que mientras el marcador sostenga el vínculo,
 * la cuenta real NO puede vincularse a ese técnico. El orden es: borrar el marcador
 * (no tiene historial, no deja rastro), invitar a la persona con su correo y vincular
 * el técnico desde la pantalla de Usuarios.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import { env } from '../src/config/env';

/** `Ivan Cortés` → `ivan.cortes`. Sin tildes ni eñes: un email no las lleva. */
const slug = (nombre: string) =>
  nombre.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '');

async function main() {
  const seco = process.argv.includes('--dry');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL }),
  });

  console.log(seco ? '— SIMULACRO (--dry): no se escribe nada —\n' : '— aplicando —\n');

  try {
    const tecnicos = await prisma.technician.findMany({
      select: { id: true, fullName: true },
      orderBy: { fullName: 'asc' },
    });
    const conUsuario = new Map(
      (await prisma.user.findMany({
        where: { technicianId: { not: null } },
        select: { technicianId: true, email: true },
      })).map((u) => [u.technicianId!, u.email]),
    );

    const nuevos: { email: string; displayName: string; technicianId: string }[] = [];
    for (const t of tecnicos) {
      const ya = conUsuario.get(t.id);
      if (ya) {
        console.log(`  salta    ${t.fullName.padEnd(22)} ya lo tiene ${ya}`);
        continue;
      }
      const email = `${slug(t.fullName)}@pendiente.invalid`;
      nuevos.push({ email, displayName: t.fullName, technicianId: t.id });
      console.log(`  ${seco ? 'crearía ' : 'crea    '} ${t.fullName.padEnd(22)} ${email}`);
    }

    if (!seco && nuevos.length) {
      await prisma.user.createMany({
        data: nuevos.map((n) => ({ ...n, roles: ['T'], isActive: false })),
        skipDuplicates: true,
      });
    }

    console.log(`\ntécnicos: ${tecnicos.length}  ·  ${seco ? 'se crearían' : 'creados'}: ${nuevos.length}`);
    console.log('Inactivos y con correo @pendiente.invalid: son un marcador con nombre, no un acceso.');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
