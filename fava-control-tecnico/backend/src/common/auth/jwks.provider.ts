import { createRemoteJWKSet } from 'jose';
import { EnvService } from '../../config/env';

/**
 * Token de DI separado A PROPOSITO: es el unico punto de sustitucion en tests.
 * Con `overrideProvider(JWKS).useValue(createLocalJWKSet(...))` la suite firma y
 * verifica tokens sin red y sin tenant real.
 */
export const JWKS = 'JWKS_RESOLVER';

// ponytail: nada de fetch + Map + TTL a mano. createRemoteJWKSet ya hace cache,
// seleccion por kid/alg/use, cooldown anti-abuso y timeout. Un rollover de clave
// con cache casero es una caida total del login sin causa visible.
export const jwksProvider = {
  provide: JWKS,
  inject: [EnvService],
  useFactory: (env: EnvService) =>
    createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/discovery/v2.0/keys`),
      { cacheMaxAge: 600_000, cooldownDuration: 30_000, timeoutDuration: 5_000 },
    ),
};
