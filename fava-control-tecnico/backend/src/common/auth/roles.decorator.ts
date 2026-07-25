import { SetMetadata } from '@nestjs/common';
import type { Role } from '../../generated/prisma/enums';

export const ROLES = 'roles';

/**
 * Roles de BD que pueden entrar al endpoint. La condicion fina (quien puede
 * asignar QUE rol) vive en users.service: un @Roles('S') aqui impediria que un
 * Admin asigne el rol Tecnico, que si puede (matriz §6).
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);
