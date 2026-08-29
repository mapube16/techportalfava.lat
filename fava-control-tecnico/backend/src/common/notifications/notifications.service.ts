import { Injectable, Logger } from '@nestjs/common';
import { env } from '../../config/env';
import { PrismaService } from '../prisma/prisma.service';
import { type Datos, type Kind, idioma, render } from './plantillas';

/** Lo minimo para poder escribirle a alguien. `lang` sale de `users.lang`. */
export interface Destinatario {
  userId: string | null;
  email: string;
  displayName: string;
  lang: string;
}

export interface Aviso {
  kind: Kind;
  /** '<kind>:<id>:<discriminante>'. Ver el comentario de `encolar`. */
  dedupeKey: string;
  para: Destinatario;
  datos: Omit<Datos, 'nombre'>;
  entity?: string;
  entityId?: string;
}

/**
 * El sufijo con el que `crear-usuarios-tecnicos.ts` marco a los tecnicos historicos
 * que aun no tienen correo real. RFC 2606 reserva `.invalid` para que NUNCA exista,
 * asi que mandar ahi es un rebote garantizado.
 */
const SIN_CORREO = '@pendiente.invalid';

/** Un destinatario al que se le puede escribir de verdad. */
export const alcanzable = (d: { email?: string | null; isActive?: boolean } | null | undefined) =>
  !!d && d.isActive !== false && !!d.email && !d.email.endsWith(SIN_CORREO);

/** La fila tal cual entra. Escrita entera y no `Record<string, unknown>`: sin los
    campos nombrados, el tipo estructural de abajo no encaja con el cliente generado. */
interface FilaNotif {
  dedupeKey: string;
  kind: string;
  toEmail: string;
  toUserId: string | null;
  lang: string;
  subject: string;
  bodyText: string;
  entity: string | null;
  entityId: string | null;
}

/** Lo minimo que `encolarEn` necesita: sirve el cliente de Nest y el `tx` del cron. */
interface ClienteNotif {
  notification: {
    createMany(args: {
      data: FilaNotif[];
      skipDuplicates?: boolean;
    }): Promise<{ count: number }>;
  };
}

/**
 * El unico sitio que escribe en `notifications`.
 *
 * Es funcion suelta y no un metodo porque tiene DOS llamadores que no comparten
 * contenedor: el servicio de Nest (dentro de la transaccion de la peticion) y el cron
 * (`scripts/notificar.ts`, que no monta Nest). Duplicar el render y el filtro en los
 * dos era garantizar que uno se quedara atras.
 *
 * `createMany` y NO `create`, por lo mismo que `audit.service.ts:39`: `create` emite
 * `INSERT ... RETURNING`, el RETURNING exige SELECT, y la politica `n_read` solo deja
 * leer a un admin. Ademas `skipDuplicates` es `ON CONFLICT DO NOTHING` sobre
 * `dedupe_key`, que es DONDE vive la idempotencia — el cron evalua la misma ventana
 * doce veces por hora y solo la primera escribe.
 */
export async function encolarEn(cliente: ClienteNotif, avisos: Aviso[]): Promise<number> {
  const escribibles = avisos.filter((a) => alcanzable(a.para));
  if (!escribibles.length) return 0;

  const { count } = await cliente.notification.createMany({
    skipDuplicates: true,
    data: escribibles.map((a) => {
      const lang = idioma(a.para.lang);
      const { subject, bodyText } = render(a.kind, lang, {
        ...a.datos,
        nombre: a.para.displayName,
      });
      return {
        dedupeKey: a.dedupeKey,
        kind: a.kind,
        toEmail: a.para.email,
        toUserId: a.para.userId,
        lang,
        subject,
        bodyText,
        entity: a.entity ?? null,
        entityId: a.entityId ?? null,
      };
    }),
  });
  return count;
}

/**
 * Fase 9 — el que ENCOLA los avisos. No envia ninguno: eso lo hace el cron
 * (`scripts/notificar.ts`) en otro proceso.
 *
 * Vive en `common/` y no en un modulo de dominio por el mismo motivo que
 * `AuditService`: lo escriben varios (las notas hoy, la bitacora manana) y el cron
 * lo lee desde fuera de Nest.
 *
 * La separacion no es gusto arquitectonico, es obligada: `RlsInterceptor` abre UNA
 * transaccion por peticion y su comentario lo dice — nada de I/O externo dentro, el
 * pool es de 10 y el timeout de 10 s. Un POST a Graph desde `transicionar()` agota el
 * pool y acaba en P2028. Encolar es CPU y un INSERT, y eso si cabe.
 */
@Injectable()
export class NotificationsService {
  private readonly log = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Escribe DENTRO de la transaccion de la peticion, igual que `AuditService`: si la
   * transicion se deshace, el aviso se deshace con ella. Un correo de «tu nota fue
   * devuelta» por una devolucion que acabo en 409 es peor que no mandar nada.
   *
   * `createMany` y NO `create`, por lo mismo que `audit.service.ts:39`: `create` emite
   * `INSERT ... RETURNING`, el RETURNING exige SELECT, y la politica `n_read` solo deja
   * leer a un admin. Ademas `skipDuplicates` es `ON CONFLICT DO NOTHING` sobre
   * `dedupe_key`, que es DONDE vive la idempotencia — el cron evalua la misma ventana
   * doce veces por hora y solo la primera escribe.
   */
  encolar(avisos: Aviso[]): Promise<number> {
    return encolarEn(this.prisma.client, avisos);
  }

  /**
   * Los avisos de una transicion de nota. Un `findUnique` y un INSERT: nada mas puede
   * pasar aqui dentro sin romper la regla de la transaccion.
   *
   * Si el tecnico no tiene usuario alcanzable no encola y deja un warn. Que eso no
   * pase desapercibido es tarea del resumen de los lunes, que cuenta y NOMBRA a los
   * inalcanzables: un warn en los logs no lo lee nadie.
   */
  async avisarTransicion(
    nota: {
      id: string;
      technicianId: string;
      weekStart: Date;
      updatedAt: Date;
      project: { name: string };
    },
    action: 'approve' | 'return',
    reason: string | null | undefined,
  ): Promise<void> {
    // UNA consulta. El nombre del proyecto ya viene en la nota (el `select` NOTA lo
    // trae para el PDF), asi que pedirlo otra vez seria un viaje de mas dentro de la
    // transaccion de la peticion — que es justo lo que hay que no hacer aqui.
    const tec = await this.prisma.client.technician.findUnique({
      where: { id: nota.technicianId },
      select: {
        user: { select: { id: true, email: true, displayName: true, lang: true, isActive: true } },
      },
    });
    const u = tec?.user;
    if (!alcanzable(u)) {
      this.log.warn(`nota ${nota.id}: el tecnico no tiene correo con el que avisarle`);
      return;
    }

    const kind = action === 'return' ? 'note_returned' : 'note_approved';
    const semana = nota.weekStart.toISOString().slice(0, 10);

    await this.encolar([
      {
        kind,
        // El `updatedAt` de la nota YA transicionada distingue una segunda devolucion
        // legitima (submitted->returned->submitted->returned son dos correos) de un
        // reintento del mismo POST, que la tabla TRANSICIONES ya rechaza con 409.
        dedupeKey: `${kind}:${nota.id}:${nota.updatedAt.toISOString()}`,
        para: {
          userId: u!.id,
          email: u!.email,
          displayName: u!.displayName,
          lang: u!.lang,
        },
        datos: {
          proyecto: nota.project.name,
          semana,
          comentario: reason ?? '',
          enlace: enlaceApp('/'),
        },
        entity: 'weekly_note',
        entityId: nota.id,
      },
    ]);
  }

  /**
   * CAT-02c — la invitacion, el UNICO aviso que dispara una persona a proposito.
   *
   * Los otros cuatro los lanza un reloj o una transicion de nota. Este lo pulsa un
   * admin, y la diferencia es deliberada: el primer correo que recibe alguien que
   * todavia no conoce la aplicacion se manda cuando toca, no cuando el sistema decide.
   * Es tambien lo que permite construir esto sin apagar `NOTIF_TRANSPORT`: mientras
   * nadie pulse, no sale nada.
   *
   * La `dedupeKey` lleva el instante A PROPOSITO. Reinvitar TIENE que volver a mandar
   * el correo —los correos se pierden, se van a spam, la gente los borra— al reves que
   * un aviso de nota, donde repetir seria ruido y por eso su clave es estable.
   */
  async invitar(
    destino: { userId: string; email: string; displayName: string; lang: string },
    invitadoPor: string,
  ) {
    await this.encolar([
      {
        kind: 'invitacion',
        // Hace UNICA cada invitacion, para que reinvitar vuelva a mandar el correo en vez
        // de chocar con el dedupe. Al reves que un aviso de nota, donde repetir es ruido.
        dedupeKey: `invitacion:${destino.userId}:${new Date().toISOString()}`, // fecha-ok: es un instante, no una fecha de trabajo
        para: destino,
        datos: { invitadoPor, enlace: enlaceApp('/') },
        entity: 'user',
        entityId: destino.userId,
      },
    ]);
  }
}

/**
 * El enlace del correo. Sin `APP_BASE_URL` no se pinta ninguno en vez de mandar una
 * URL rota: con `NOTIF_TRANSPORT=console` la variable no es obligatoria.
 *
 * Va a la raiz y no a la nota concreta porque el frontend no tiene rutas por URL
 * — la navegacion es estado en `state.tsx`, asi que `/notas/<id>` no lleva a ningun
 * sitio. ponytail: cuando haya router, aqui se pone la ruta profunda.
 */
export function enlaceApp(ruta: string): string | undefined {
  // `env` y no `process.env`: el contrato validado en config/env.ts es el unico sitio
  // del que salen las variables, y su superRefine ya garantiza que con `graph` esta.
  const base = env.APP_BASE_URL;
  return base ? base.replace(/\/$/, '') + ruta : undefined;
}
