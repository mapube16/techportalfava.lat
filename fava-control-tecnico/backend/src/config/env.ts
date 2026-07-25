import { Injectable } from '@nestjs/common';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// dotenv no pisa variables ya presentes: en Railway ganan las del entorno.
loadDotenv({ quiet: true });

/** Las 8 variables del contrato de Fase 1. Ninguna constante escondida en el codigo. */
const envSchema = z.object({
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
