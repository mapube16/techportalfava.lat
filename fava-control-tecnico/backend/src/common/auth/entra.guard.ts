import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { type JWTPayload, type JWTVerifyGetKey, jwtVerify } from 'jose';
import { EnvService } from '../../config/env';
import type { UserModel as User } from '../../generated/prisma/models';
import { PrismaService } from '../prisma/prisma.service';
import { ALLOW_UNPROVISIONED } from './allow-unprovisioned.decorator';
import { JWKS } from './jwks.provider';
import { IS_PUBLIC } from './public.decorator';

/** Identidad tal y como la afirma el token. Existe aunque no haya usuario en BD. */
export interface EntraIdentity {
  oid: string;
  email: string;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      /** Siempre presente tras el guard (salvo rutas @Public). */
      entra?: EntraIdentity;
      /** Fila de users por oid, ACTIVA O NO. La usa /api/me para decir «desactivado». */
      dbUser?: User | null;
      /** Solo si esta activo. Es el que autoriza y el que alimenta el contexto RLS. */
      user?: User | null;
    }
  }
}

const normalizar = (v: unknown): string => (typeof v === 'string' ? v.trim().toLowerCase() : '');

@Injectable()
export class EntraGuard implements CanActivate {
  constructor(
    private readonly env: EnvService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
    @Inject(JWKS) private readonly jwks: JWTVerifyGetKey,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.meta(ctx, IS_PUBLIC)) return true;

    const req = ctx.switchToHttp().getRequest<Request>();
    const cabecera = req.headers.authorization ?? '';
    const token = cabecera.startsWith('Bearer ') ? cabecera.slice(7).trim() : '';
    if (!token) throw new UnauthorizedException('TOKEN_AUSENTE');

    const payload = await this.verificar(token);

    // El issuer ya se comprobo, pero un endpoint /common emitiria issuer generico:
    // el chequeo explicito de `tid` es lo que cierra el agujero multi-tenant.
    if (payload.tid !== this.env.ENTRA_TENANT_ID) throw new UnauthorizedException('TENANT_AJENO');
    if (!String(payload.scp ?? '').split(' ').includes(this.env.ENTRA_REQUIRED_SCOPE))
      throw new ForbiddenException('SCOPE_INSUFICIENTE');

    const oid = typeof payload.oid === 'string' ? payload.oid : '';
    if (!oid) throw new UnauthorizedException('TOKEN_SIN_OID');
    // Claim `email`, NUNCA preferred_username/upn: son mutables y reasignables en
    // Entra, y un email reciclado aterrizaria en la invitacion de otra persona.
    const email = normalizar(payload.email);
    req.entra = { oid, email, name: typeof payload.name === 'string' ? payload.name : email };

    // Sin cache (AUTH-04): desactivar corta en la peticion siguiente con el MISMO
    // token. Un SELECT por indice unico es ruido frente a la verificacion
    // criptografica que acaba de ocurrir en esta misma peticion.
    let user = await this.prisma.base.user.findUnique({ where: { entraOid: oid } });
    if (!user && email) user = await this.vincular(oid, email);

    req.dbUser = user;
    req.user = user?.isActive ? user : null;
    if (!req.user && !this.meta(ctx, ALLOW_UNPROVISIONED)) throw new ForbiddenException('SIN_ACCESO');
    return true;
  }

  private meta(ctx: ExecutionContext, clave: string): boolean {
    return (
      this.reflector.getAllAndOverride<boolean>(clave, [ctx.getHandler(), ctx.getClass()]) ?? false
    );
  }

  private async verificar(token: string): Promise<JWTPayload> {
    try {
      const { payload } = await jwtVerify(token, this.jwks, {
        issuer: `https://login.microsoftonline.com/${this.env.ENTRA_TENANT_ID}/v2.0`,
        audience: this.env.ENTRA_API_CLIENT_ID,
        clockTolerance: 60,
      });
      return payload;
    } catch {
      // Firma, iss, aud, exp o nbf. El detalle no se filtra al cliente.
      throw new UnauthorizedException('TOKEN_INVALIDO');
    }
  }

  /**
   * Primer login de un invitado (CONTEXT: el Admin invita por email, el OID queda
   * como identidad definitiva). Atomico: si otro proceso vinculo primero, count
   * es 0 y no se sobrescribe nada. Escrito el entra_oid, el email no vuelve a
   * autenticar nunca.
   */
  private async vincular(oid: string, email: string): Promise<User | null> {
    const { count } = await this.prisma.base.user.updateMany({
      where: { email, entraOid: null, isActive: true },
      data: { entraOid: oid },
    });
    if (count !== 1) return null;
    return this.prisma.base.user.findUnique({ where: { entraOid: oid } });
  }
}
