import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC = 'is_public';

/**
 * Sin token en absoluto. Unico uso: /health, que Railway consulta sin credenciales.
 * Distinto de @AllowUnprovisioned, que SI exige un token valido del tenant.
 */
export const Public = () => SetMetadata(IS_PUBLIC, true);
