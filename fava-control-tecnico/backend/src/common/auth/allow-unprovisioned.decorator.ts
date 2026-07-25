import { SetMetadata } from '@nestjs/common';

export const ALLOW_UNPROVISIONED = 'allow_unprovisioned';

/**
 * Deja pasar un token valido del tenant cuyo `oid` no resuelve a un usuario
 * activo. Solo dos endpoints lo llevan: GET /api/me (necesita distinguir
 * not_invited de deactivated) y POST /api/access-requests. Todo lo demas
 * responde 403, o cualquier miembro del tenant de FAVA entraria a la app.
 */
export const AllowUnprovisioned = () => SetMetadata(ALLOW_UNPROVISIONED, true);
