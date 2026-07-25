import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, from, lastValueFrom } from 'rxjs';
import { PrismaService, als } from './prisma.service';

/** Lo que el guard de auth (Plan 01-03) deja en la peticion. */
interface RequestUser {
  id: string;
  technicianId?: string | null;
  roles: string[];
}

/**
 * Transaccion-por-peticion: abre UNA $transaction interactiva, fija las 3 GUCs del
 * contexto RLS y guarda el tx en el AsyncLocalStorage. Todo lo que corra despues
 * (servicios via PrismaService.client) usa esa misma conexion, con politica activa,
 * sin tener que acordarse de pasar el tx.
 *
 * REGLA: nada de I/O externo (HTTP, colas, S3) dentro del handler. La transaccion
 * retiene una conexion del pool (max 10) mientras dura y el timeout es de 10 s:
 * una llamada de red lenta agota el pool antes que la CPU y acaba en P2028.
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  constructor(private readonly prisma: PrismaService) {}

  intercept(ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Sin identidad no hay contexto que fijar: /health, estaticos, y /api/me o
    // POST /api/access-requests de un usuario aun no aprovisionado. Abrir la
    // transaccion aqui seria una conexion retenida sin ninguna politica que aplicar.
    const req = ctx.switchToHttp().getRequest<{ user?: RequestUser }>();
    if (!req?.user) return next.handle();
    const u = req.user;
    const isAdmin = u.roles.some((r) => r === 'A' || r === 'S') ? 'on' : 'off';

    return from(
      this.prisma.base.$transaction(async (tx) => {
        // El tercer argumento TRUE (is_local) es lo unico que impide que el contexto
        // sobreviva al release() de la conexion y lo herede la peticion siguiente,
        // que puede ser de otro tecnico. Bug intermitente e invisible en dev.
        await tx.$executeRaw`SELECT
          set_config('app.user_id',       ${u.id},                 TRUE),
          set_config('app.technician_id', ${u.technicianId ?? ''}, TRUE),
          set_config('app.is_admin',      ${isAdmin},              TRUE)`;
        return als.run(tx, () => lastValueFrom(next.handle()));
      }),
    );
  }
}
