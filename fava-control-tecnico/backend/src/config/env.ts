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
  })
  // Validacion cruzada: encender el modo sin contraseña fuerte no arranca.
  .superRefine((v, ctx) => {
    if (v.DEV_AUTH_ENABLED && (v.DEV_AUTH_PASSWORD ?? '').length < DEV_AUTH_MIN_PASSWORD) {
      ctx.addIssue({
        code: 'custom',
        path: ['DEV_AUTH_PASSWORD'],
        message: `con DEV_AUTH_ENABLED=true es obligatoria y de ${DEV_AUTH_MIN_PASSWORD} caracteres o mas (no hay valor por defecto)`,
      });
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
