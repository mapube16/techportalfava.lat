import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { JWTVerifyGetKey } from 'jose';
import {
  API_AUDIENCE,
  SCOPE,
  TENANT_A,
  TENANT_B,
  localJwks,
  signTestToken,
} from '../../../test/helpers/tokens';
import { AllowUnprovisioned } from './allow-unprovisioned.decorator';
import { EntraGuard } from './entra.guard';

const OID = 'oid-tecnico-1';
const EMAIL = 'tecnico@fava.local';

/** Handlers reales para que Reflector lea metadata de verdad, no un mock de metadata. */
class RutaFalsa {
  protegida() {}

  @AllowUnprovisioned()
  abierta() {}
}

const envFalso = {
  ENTRA_TENANT_ID: TENANT_A,
  ENTRA_API_CLIENT_ID: API_AUDIENCE,
  ENTRA_REQUIRED_SCOPE: SCOPE,
} as never;

const findUnique = jest.fn();
const updateMany = jest.fn();
const prismaFalso = { base: { user: { findUnique, updateMany } } } as never;

function contexto(token?: string, handler: () => void = RutaFalsa.prototype.protegida) {
  const req: Record<string, unknown> = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };
  const ctx = {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => handler,
    getClass: () => RutaFalsa,
  } as unknown as ExecutionContext;
  return { req, ctx };
}

const usuarioActivo = {
  id: 'u-1',
  entraOid: OID,
  email: EMAIL,
  displayName: 'Tecnico Uno',
  roles: ['T'],
  isActive: true,
  technicianId: null,
};

describe('EntraGuard', () => {
  let guard: EntraGuard;
  let jwks: JWTVerifyGetKey;

  beforeAll(async () => {
    jwks = await localJwks();
    guard = new EntraGuard(envFalso, prismaFalso, new Reflector(), jwks);
  });

  beforeEach(() => {
    findUnique.mockReset();
    updateMany.mockReset();
  });

  describe('rechazos de token (AUTH-01)', () => {
    it('sin cabecera Authorization → 401', async () => {
      const { ctx } = contexto();
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('token expirado → 401', async () => {
      const token = await signTestToken({ oid: OID, email: EMAIL, exp: '-5m' });
      const { ctx } = contexto(token);
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('aud ajeno → 401', async () => {
      const token = await signTestToken({ oid: OID, email: EMAIL, aud: 'api://otra-api' });
      const { ctx } = contexto(token);
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('tid ajeno con issuer valido → 401', async () => {
      // El issuer va del tenant bueno a proposito: sin el chequeo explicito de
      // `tid` este token pasaria, que es justo el agujero multi-tenant.
      const token = await signTestToken({
        oid: OID,
        email: EMAIL,
        tid: TENANT_B,
        iss: `https://login.microsoftonline.com/${TENANT_A}/v2.0`,
      });
      const { ctx } = contexto(token);
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('token sin el scope exigido → 403', async () => {
      const token = await signTestToken({ oid: OID, email: EMAIL, scp: null });
      const { ctx } = contexto(token);
      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
      expect(findUnique).not.toHaveBeenCalled();
    });
  });

  describe('resolucion del usuario', () => {
    it('token valido de un usuario activo → req.user y req.entra poblados', async () => {
      findUnique.mockResolvedValueOnce(usuarioActivo);
      const token = await signTestToken({ oid: OID, email: EMAIL, name: 'Tecnico Uno' });
      const { ctx, req } = contexto(token);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(findUnique).toHaveBeenCalledWith({ where: { entraOid: OID } });
      expect(req.user).toEqual(usuarioActivo);
      expect(req.entra).toEqual({ oid: OID, email: EMAIL, name: 'Tecnico Uno' });
    });

    it('consulta la BD en CADA peticion: sin cache que invalidar (AUTH-04)', async () => {
      findUnique.mockResolvedValue(usuarioActivo);
      const token = await signTestToken({ oid: OID, email: EMAIL });
      await guard.canActivate(contexto(token).ctx);
      await guard.canActivate(contexto(token).ctx);
      expect(findUnique).toHaveBeenCalledTimes(2);
    });

    it('usuario desactivado → req.user null y 403 en ruta protegida', async () => {
      findUnique.mockResolvedValueOnce({ ...usuarioActivo, isActive: false });
      const token = await signTestToken({ oid: OID, email: EMAIL });
      const { ctx, req } = contexto(token);

      await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
      expect(req.user).toBeNull();
    });

    it('usuario desactivado en ruta @AllowUnprovisioned → pasa con req.dbUser inactivo', async () => {
      const inactivo = { ...usuarioActivo, isActive: false };
      findUnique.mockResolvedValueOnce(inactivo);
      const token = await signTestToken({ oid: OID, email: EMAIL });
      const { ctx, req } = contexto(token, RutaFalsa.prototype.abierta);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.user).toBeNull();
      expect(req.dbUser).toEqual(inactivo);
    });
  });

  describe('vinculacion email → OID (Pitfall 6)', () => {
    it('primer login de un invitado: updateMany atomico con count 1 y sigue como ese usuario', async () => {
      findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(usuarioActivo);
      updateMany.mockResolvedValueOnce({ count: 1 });
      // Mayusculas y espacios: el email del token se normaliza antes de comparar.
      const token = await signTestToken({ oid: OID, email: `  ${EMAIL.toUpperCase()} ` });
      const { ctx, req } = contexto(token);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(updateMany).toHaveBeenCalledWith({
        where: { email: EMAIL, entraOid: null, isActive: true },
        data: { entraOid: OID },
      });
      expect(req.user).toEqual(usuarioActivo);
    });

    it('oid desconocido sin invitacion: count 0 → 403 en ruta protegida, pasa en @AllowUnprovisioned', async () => {
      findUnique.mockResolvedValue(null);
      updateMany.mockResolvedValue({ count: 0 });
      const token = await signTestToken({ oid: 'oid-extraño', email: 'nadie@fava.local' });

      await expect(guard.canActivate(contexto(token).ctx)).rejects.toBeInstanceOf(ForbiddenException);

      const { ctx, req } = contexto(token, RutaFalsa.prototype.abierta);
      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(req.user).toBeNull();
      expect(req.entra).toEqual({
        oid: 'oid-extraño',
        email: 'nadie@fava.local',
        name: 'nadie@fava.local',
      });
    });

    it('token sin claim email: no intenta vincular (preferred_username nunca autentica)', async () => {
      findUnique.mockResolvedValue(null);
      const token = await signTestToken({ oid: 'oid-sin-email' });
      const { ctx } = contexto(token, RutaFalsa.prototype.abierta);

      await expect(guard.canActivate(ctx)).resolves.toBe(true);
      expect(updateMany).not.toHaveBeenCalled();
    });
  });
});
