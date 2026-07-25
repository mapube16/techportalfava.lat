import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import type { Role } from '../../generated/prisma/enums';
import { ROLES } from './roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const exigidos = this.reflector.getAllAndOverride<Role[]>(ROLES, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!exigidos?.length) return true;

    // Los roles salen de la BD (los puso EntraGuard), jamas del rol activo del
    // switcher del cliente: eso es estado de UI y no autoriza nada.
    const user = ctx.switchToHttp().getRequest<Request>().user;
    if (!user || !user.roles.some((r) => exigidos.includes(r)))
      throw new ForbiddenException('ROL_INSUFICIENTE');
    return true;
  }
}
