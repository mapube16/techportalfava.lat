/**
 * Las tres cuentas de prueba, una POR ROL.
 *
 *     npm -w backend run cuentas            # aplica
 *     npm -w backend run cuentas -- --dry   # solo muestra, no escribe
 *
 * Corre como OWNER, igual que los migradores: crear usuarios es administración, no
 * runtime. IDEMPOTENTE por email — volver a correrlo corrige roles y vínculo.
 *
 * POR QUÉ UNA CUENTA POR ROL Y NO UNA CON LOS TRES:
 * el selector T·A·S del encabezado dejaba ver las tres vistas desde una sola sesión, y
 * eso sirve para enseñar la app pero NO para probarla: con un usuario que tiene los tres
 * roles, ningún 403 salta nunca y un endpoint mal protegido pasa desapercibido. Con tres
 * cuentas de un rol cada una, lo que el servidor prohíbe se ve de verdad.
 *
 * OJO — entra_oid: estas cuentas nacen SIN él, así que el primer login por Microsoft
 * Entra las reclama por email. Si se prueban antes con el login de desarrollo, el oid
 * queda con prefijo `dev:` y ANTES del cutover al tenant real hay que limpiarlo:
 *
 *     UPDATE users SET entra_oid = NULL WHERE entra_oid LIKE 'dev:%';
 *
 * Sin eso, el primer login real falla en silencio (el guard busca por oid, no lo
 * encuentra y trata al usuario como no invitado).
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';
import type { Role } from '../src/generated/prisma/enums';
import { env } from '../src/config/env';

interface Cuenta {
  email: string;
  displayName: string;
  roles: Role[];
  /** Nombre EXACTO del técnico a vincular. Solo la cuenta de técnico lo necesita. */
  technician?: string;
}

/**
 * El rol NO se acumula: cada cuenta lleva UNO. Un usuario con ['T','A'] es admin a
 * todos los efectos (el guard usa el conjunto), así que mezclarlos volvería a tapar
 * justo lo que estas cuentas existen para destapar.
 */
const CUENTAS: Cuenta[] = [
  {
    email: 'tecnico@fava-la.com',
    displayName: 'Técnico de prueba',
    roles: ['T'],
    // Sin vínculo a un técnico, la bitácora responde USUARIO_SIN_TECNICO y la cuenta
    // no sirve para nada: la GUC `app.technician_id` sale vacía y RLS filtra todo.
    technician: 'Ivan Cortes',
  },
  { email: 'admin@fava-la.com', displayName: 'Administrador de prueba', roles: ['A'] },
  { email: 'super@fava-la.com', displayName: 'Super Admin de prueba', roles: ['S'] },
];

async function main() {
  const dry = process.argv.includes('--dry');
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: env.MIGRATE_DATABASE_URL ?? env.DATABASE_URL }),
  });

  console.log(dry ? '— SIMULACRO (--dry) —\n' : '— aplicando —\n');

  try {
    for (const c of CUENTAS) {
      let technicianId: string | null = null;
      if (c.technician) {
        const t = await prisma.technician.findFirst({
          where: { fullName: c.technician },
          select: { id: true },
        });
        if (!t) {
          console.log(`FALLA: no existe el técnico «${c.technician}» — no se escribió nada`);
          process.exitCode = 1;
          return;
        }
        // El vínculo es @unique: si otro usuario ya lo tiene, el motor lo rechaza. Se
        // comprueba antes para poder decirlo con nombre en vez de soltar un P2002.
        const ocupado = await prisma.user.findFirst({
          where: { technicianId: t.id, email: { not: c.email } },
          select: { email: true },
        });
        if (ocupado) {
          console.log(`FALLA: «${c.technician}» ya está vinculado a ${ocupado.email}`);
          process.exitCode = 1;
          return;
        }
        technicianId = t.id;
      }

      const existente = await prisma.user.findUnique({ where: { email: c.email }, select: { id: true } });
      const datos = { displayName: c.displayName, roles: c.roles, technicianId, isActive: true };

      if (!dry) {
        if (existente) await prisma.user.update({ where: { email: c.email }, data: datos });
        else await prisma.user.create({ data: { email: c.email, ...datos } });
      }

      const marca = existente ? 'actualiza' : 'crea     ';
      console.log(`  ${marca} ${c.email.padEnd(24)} [${c.roles.join(',')}]  ${c.technician ?? ''}`);
    }

    // Las cuentas que YA existían y llevan más de un rol: no se tocan (una de ellas
    // puede ser el único Super Admin y quitarle el rol sería un lockout), pero se
    // nombran, porque desde ellas el reparto por rol se sigue sin ver.
    const multi = await prisma.user.findMany({
      where: { isActive: true, email: { notIn: CUENTAS.map((c) => c.email) } },
      select: { email: true, roles: true },
    });
    const conVarios = multi.filter((u) => u.roles.length > 1);
    if (conVarios.length) {
      console.log('\n— cuentas con MÁS de un rol (no se tocan) —');
      for (const u of conVarios) console.log(`  ${u.email}  [${u.roles.join(',')}]`);
      console.log('  Desde estas no se ve el reparto por rol: usa las tres de arriba para probar.');
    }

    console.log('\nEntran con el login de desarrollo (la contraseña compartida, DEV_AUTH_PASSWORD).');
  } finally {
    await prisma.$disconnect();
  }
}

void main();
