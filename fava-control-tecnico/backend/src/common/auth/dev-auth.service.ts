import { createHash, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { SignJWT } from 'jose';
import { DEV_AUTH_MIN_PASSWORD, EnvService } from '../../config/env';
import type { UserModel as User } from '../../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_KID, devKeyPair } from './jwks.provider';

/** Una jornada. Al reiniciar el proceso el par de claves cambia y caducan todos. */
const VIDA_SEGUNDOS = 8 * 3_600;

export interface DevLoginBody {
  email?: unknown;
  password?: unknown;
}

export interface DevLoginResponse {
  access_token: string;
  expires_in: number;
}

/**
 * Emisor de tokens del login de desarrollo (Plan 01-07). Solo se instancia con
 * DEV_AUTH_ENABLED=true: app.module no registra su modulo en ningun otro caso.
 *
 * Este servicio NO autentica a nadie: emite un JWT RS256 que despues recorre
 * entero el EntraGuard de siempre (firma contra el JWKS, issuer, audiencia,
 * expiracion, tid, scope y lookup del usuario en BD). No existe ningun camino
 * que salte esa verificacion; lo unico que cambia es quien firma.
 */
@Injectable()
export class DevAuthService {
  constructor(
    private readonly env: EnvService,
    private readonly prisma: PrismaService,
  ) {}

  async login(body: DevLoginBody): Promise<DevLoginResponse> {
    const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    // Las dos comprobaciones SIEMPRE, y una sola respuesta: contraseña mala,
    // email inexistente y usuario desactivado son indistinguibles desde fuera.
    const passwordOk = this.passwordCoincide(body?.password);
    const user = email ? await this.prisma.base.user.findUnique({ where: { email } }) : null;
    if (!passwordOk || !user?.isActive) throw new UnauthorizedException('CREDENCIALES_INVALIDAS');

    return { access_token: await this.firmar(user), expires_in: VIDA_SEGUNDOS };
  }

  /**
   * Comparacion en tiempo constante. Se comparan los sha256 y no las cadenas
   * porque `timingSafeEqual` exige la misma longitud: mirar la longitud antes
   * seria filtrar el tamaño de la contraseña.
   */
  private passwordCoincide(candidata: unknown): boolean {
    const esperada = this.env.DEV_AUTH_PASSWORD ?? '';
    // El esquema zod ya lo impide en el arranque; aqui no se negocia: sin
    // contraseña fuerte configurada no coincide NADA (ni la cadena vacia).
    if (esperada.length < DEV_AUTH_MIN_PASSWORD) return false;
    const digest = (v: string) => createHash('sha256').update(v, 'utf8').digest();
    return timingSafeEqual(digest(typeof candidata === 'string' ? candidata : ''), digest(esperada));
  }

  /** Las claims exactas que el guard exige. Ni una mas: no hay claims «de dev». */
  private async firmar(user: User): Promise<string> {
    const { privateKey } = await devKeyPair();
    const tid = this.env.ENTRA_TENANT_ID;
    return new SignJWT({
      tid,
      // Sin tenant real el usuario no tiene OID de Microsoft: el prefijo `dev:`
      // hace el cutover un UPDATE ... WHERE entra_oid LIKE 'dev:%' (docs/ENV.md).
      // Es estable entre reinicios, o el segundo login no encontraria la fila.
      oid: user.entraOid ?? `dev:${user.id}`,
      email: user.email,
      name: user.displayName,
      scp: this.env.ENTRA_REQUIRED_SCOPE,
      ver: '2.0',
    })
      .setProtectedHeader({ alg: 'RS256', kid: DEV_KID })
      .setIssuedAt()
      .setIssuer(`https://login.microsoftonline.com/${tid}/v2.0`)
      .setAudience(this.env.ENTRA_API_CLIENT_ID)
      .setExpirationTime(`${VIDA_SEGUNDOS}s`)
      .sign(privateKey);
  }
}
