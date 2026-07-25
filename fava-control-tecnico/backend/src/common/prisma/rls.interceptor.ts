import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Esqueleto pass-through. El Plan 01-02 lo implementa: abre una $transaction
 * interactiva por peticion autenticada, fija app.user_id / app.technician_id /
 * app.is_admin con set_config(..., TRUE) y guarda el tx en el AsyncLocalStorage.
 *
 * Existe ya, registrado como APP_INTERCEPTOR en app.module, para que 01-02 solo
 * toque este archivo y no el modulo raiz (evita conflictos entre plans paralelas).
 */
@Injectable()
export class RlsInterceptor implements NestInterceptor {
  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle();
  }
}
