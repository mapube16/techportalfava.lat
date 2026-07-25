import type { JSONWebKeySet, JWTVerifyGetKey } from 'jose';
import { createLocalJWKSet, createRemoteJWKSet, exportJWK, generateKeyPair } from 'jose';
import { EnvService } from '../../config/env';

/**
 * Token de DI separado A PROPOSITO: es el unico punto de sustitucion en tests.
 * Con `overrideProvider(JWKS).useValue(createLocalJWKSet(...))` la suite firma y
 * verifica tokens sin red y sin tenant real.
 */
export const JWKS = 'JWKS_RESOLVER';

/** `kid` del par local: un token de desarrollo se reconoce de un vistazo. */
export const DEV_KID = 'dev-auth';

let par: Promise<{
  privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey'];
  jwks: JSONWebKeySet;
}>;

/**
 * Par RSA efimero del login de desarrollo (Plan 01-07). Vive solo en memoria: al
 * reiniciar el proceso cambia y todos los tokens emitidos dejan de valer, que es
 * exactamente lo que se quiere de un acceso temporal.
 *
 * Solo lo piden dos sitios, y ambos solo con DEV_AUTH_ENABLED=true: el provider
 * de abajo (para verificar) y dev-auth.service (para firmar).
 */
export function devKeyPair() {
  par ??= (async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const jwk = await exportJWK(publicKey);
    return { privateKey, jwks: { keys: [{ ...jwk, kid: DEV_KID, alg: 'RS256', use: 'sig' }] } };
  })();
  return par;
}

// ponytail: nada de fetch + Map + TTL a mano. createRemoteJWKSet ya hace cache,
// seleccion por kid/alg/use, cooldown anti-abuso y timeout. Un rollover de clave
// con cache casero es una caida total del login sin causa visible.
export const jwksProvider = {
  provide: JWKS,
  inject: [EnvService],
  useFactory: async (env: EnvService): Promise<JWTVerifyGetKey> =>
    // Lo UNICO que cambia el modo desarrollo: quien firma. El keyset local
    // SUSTITUYE al de Microsoft (no se suma), y el guard no se entera: sigue
    // verificando firma, issuer, audiencia y expiracion igual que siempre.
    env.DEV_AUTH_ENABLED
      ? createLocalJWKSet((await devKeyPair()).jwks)
      : createRemoteJWKSet(
          new URL(`https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/discovery/v2.0/keys`),
          { cacheMaxAge: 600_000, cooldownDuration: 30_000, timeoutDuration: 5_000 },
        ),
};
