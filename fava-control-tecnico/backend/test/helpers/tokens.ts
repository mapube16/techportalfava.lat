/**
 * Tokens de prueba firmados dentro del proceso: sin red y sin tenant real.
 *
 * El par de claves se genera una vez y se expone como JWKS local; los tests
 * sustituyen el provider JWKS (`overrideProvider(JWKS)`) por este resolver, con
 * lo que `jwtVerify` valida firma de verdad contra una clave que controlamos.
 * Asi se pueden construir los casos que Entra nunca emitiria a mano: expirado,
 * `aud` ajeno, otro `tid`, sin `scp`.
 */
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from 'jose';
import type { JSONWebKeySet, JWTVerifyGetKey } from 'jose';

/** Dos tenants ficticios: el swap del Plan (AUTH-01) es solo cambiar cual se usa. */
export const TENANT_A = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
export const TENANT_B = 'bbbbbbbb-2222-4222-8222-bbbbbbbbbbbb';
/** Audiencia que los tests fijan en EnvService.ENTRA_API_CLIENT_ID. */
export const API_AUDIENCE = 'api://fava-test';
export const SCOPE = 'access_as_user';

const KID = 'test-key';

let par:
  | Promise<{ privateKey: Awaited<ReturnType<typeof generateKeyPair>>['privateKey']; jwks: JSONWebKeySet }>
  | undefined;

function claves() {
  par ??= (async () => {
    const { privateKey, publicKey } = await generateKeyPair('RS256', { extractable: true });
    const jwk = await exportJWK(publicKey);
    return { privateKey, jwks: { keys: [{ ...jwk, kid: KID, alg: 'RS256', use: 'sig' }] } };
  })();
  return par;
}

/** Sustituto del provider JWKS: resuelve contra la clave local, jamas contra la red. */
export async function localJwks(): Promise<JWTVerifyGetKey> {
  return createLocalJWKSet((await claves()).jwks);
}

export interface TestClaims {
  oid: string;
  email?: string;
  name?: string;
  tid?: string;
  /** Por defecto el issuer coincide con `tid`; separarlos permite probar el chequeo de `tid`. */
  iss?: string;
  aud?: string;
  /** `null` = token sin `scp` (caso 403). */
  scp?: string | null;
  /** Formato de jose: '1h', '-5m', o epoch en segundos. */
  exp?: string | number;
}

export async function signTestToken(c: TestClaims): Promise<string> {
  const { privateKey } = await claves();
  const tid = c.tid ?? TENANT_A;
  const payload: Record<string, unknown> = { tid, oid: c.oid };
  if (c.email !== undefined) payload.email = c.email;
  if (c.name !== undefined) payload.name = c.name;
  if (c.scp !== null) payload.scp = c.scp ?? SCOPE;

  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'RS256', kid: KID })
    .setIssuedAt()
    .setIssuer(c.iss ?? `https://login.microsoftonline.com/${tid}/v2.0`)
    .setAudience(c.aud ?? API_AUDIENCE)
    .setExpirationTime(c.exp ?? '1h')
    .sign(privateKey);
}
