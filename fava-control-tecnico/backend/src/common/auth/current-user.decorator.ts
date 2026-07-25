import { type ExecutionContext, createParamDecorator } from '@nestjs/common';
import type { Request } from 'express';
import type { UserModel as User } from '../../generated/prisma/models';

/** El usuario de BD que resolvio EntraGuard. Nunca null en rutas sin @AllowUnprovisioned. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): User =>
    ctx.switchToHttp().getRequest<Request>().user as User,
);
