import { Injectable } from '@nestjs/common';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// dotenv no pisa variables ya presentes: en Railway ganan las del entorno.
loadDotenv({ quiet: true });

/** Longitud minima de la contraseña del login de desarrollo. No negociable. */
export const DEV_AUTH_MIN_PASSWORD = 12;

/** El contrato de Fase 1. Ninguna constante escondida en el codigo. */
const envSchema = z
  .object({
    /** Runtime: rol fava_app (NOBYPASSRLS). Nunca el owner. */
    DATABASE_URL: z.string().min(1),
    /** Owner: migraciones, seed y db-bootstrap. */
    MIGRATE_DATABASE_URL: z.string().min(1),
    /** Password que db-bootstrap asigna a fava_app. */
    APP_DB_PASSWORD: z.string().min(1),
    ENTRA_TENANT_ID: z.string().min(1),
    ENTRA_API_CLIENT_ID: z.string().min(1),
    ENTRA_REQUIRED_SCOPE: z.string().min(1).default('access_as_user'),
    SEED_SUPERADMIN_EMAIL: z.email(),
    PORT: z.coerce.number().int().positive().default(3000),

    /**
     * Login de desarrollo temporal (Plan 01-07), APAGADO por defecto.
     * Solo el valor exacto 'true' lo enciende y solo 'false' lo apaga: cualquier
     * otra cosa ('TRUE', '1', 'si') mata el arranque en vez de dejar el estado
     * del modo a merced de un typo.
     */
    DEV_AUTH_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
    /** Contraseña compartida del login de desarrollo. Sin default: ver el refine. */
    DEV_AUTH_PASSWORD: z.string().optional(),

    /**
     * Fase 9 — por donde salen los avisos.
     *
     * `console` los imprime y los marca enviados sin tocar la red: es a la vez el
     * dry-run, el modo de los tests y el estado en el que se despliega la fase entera
     * ANTES de que Entra conceda nada. Encender el correo de verdad es cambiar esta
     * variable, sin tocar codigo.
     *
     * Enum cerrado por el mismo motivo que DEV_AUTH_ENABLED: un typo ('Graph', 'grahp')
     * mata el arranque en vez de dejar en silencio los avisos en modo consola durante
     * un mes, que es un fallo que nadie mira.
     */
    NOTIF_TRANSPORT: z.enum(['console', 'graph']).default('console'),
    /** El buzon remitente. Obligatoria con `graph`: ver el refine. */
    NOTIF_FROM: z.string().optional(),
    /**
     * El registro DEDICADO al correo, distinto del que valida los tokens de entrada.
     * Separado a proposito: el registro del API es un resource server, y hacerlo
     * ademas cliente confidencial con permisos de aplicacion mezcla dos papeles. Y la
     * Application Access Policy de Exchange se ata a un AppId — con uno dedicado se
     * revoca el envio de correo sin tocar el login de nadie.
     */
    ENTRA_MAIL_CLIENT_ID: z.string().optional(),
    /** Secreto de ESE registro, para el flujo client-credentials de Graph. */
    ENTRA_CLIENT_SECRET: z.string().optional(),
    /**
     * La zona en la que se leen «viernes» y «las 16:00». UNA sola para todo el sistema:
     * no hay zona horaria por tecnico y anadirla seria una columna mas y dos entradas de
     * cron. Nombre IANA porque `Intl` sabe de horario de verano y un desfase fijo no.
     */
    NOTIF_TZ: z.string().min(1).default('America/Bogota'),
    /** Raiz publica de la app, para el enlace del correo. Obligatoria con `graph`. */
    APP_BASE_URL: z.string().optional(),
  })
  // Validacion cruzada: encender un modo sin lo que ese modo necesita no arranca.
  .superRefine((v, ctx) => {
    if (v.DEV_AUTH_ENABLED && (v.DEV_AUTH_PASSWORD ?? '').length < DEV_AUTH_MIN_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_AUTH_PASSWORD'],
        message: `con DEV_AUTH_ENABLED=true es obligatoria y de ${DEV_AUTH_MIN_PASSWORD} caracteres o mas (no hay valor por defecto)`,
      });
    }
    // Las tres que solo hacen falta para hablar con Graph. Se exigen al arrancar y no
    // en el primer envio: un cron que descubre a las 16:01 del viernes que le falta el
    // secreto es un aviso perdido que nadie ve hasta el lunes.
    if (v.NOTIF_TRANSPORT === 'graph') {
      const exigidas = [
        'NOTIF_FROM',
        'ENTRA_MAIL_CLIENT_ID',
        'ENTRA_CLIENT_SECRET',
        'APP_BASE_URL',
      ] as const;
      for (const clave of exigidas) {
        if (!v[clave])
          ctx.addIssue({
            code: 'custom',
            path: [clave],
            message: 'con NOTIF_TRANSPORT=graph es obligatoria',
          });
      }
    }
  });

export type Env = Readonly<z.infer<typeof envSchema>>;

/**
 * Valida el entorno o lanza. Se llama al cargar el modulo, por lo que un entorno
 * incompleto mata el proceso al arrancar y no en la primera peticion (INFRA-01).
 */
export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const detalle = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(raiz)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Entorno invalido, el proceso no arranca:\n${detalle}`);
  }
  return Object.freeze(parsed.data);
}

export const env: Env = loadEnv();

/**
 * Misma informacion que `env`, inyectable. Existe porque providers como el JWKS
 * de Entra (Plan 01-03) se construyen con `useFactory` + `inject`.
 */
@Injectable()
export class EnvService {
  constructor() {
    Object.assign(this, env);
  }
}
// Declaration merging: EnvService expone exactamente las claves de Env, tipadas.
export interface EnvService extends Env {}
