import { env } from '../../config/env';

/**
 * «¿Es viernes a las 16:00?» leido en la zona de NOTIF_TZ, no en la del proceso.
 *
 * Railway corre en UTC y los tecnicos estan en Italia y en Latinoamerica. Sin esto,
 * «viernes 16:00» seria viernes 16:00 UTC, que es media manana en Bogota — el tecnico
 * aun no ha trabajado el viernes cuando le llega el recordatorio de que no lo registro.
 *
 * `Intl.DateTimeFormat` es stdlib y sabe de horario de verano; un desfase fijo (-5, +2)
 * no, y el domingo del cambio de hora el aviso saldria una hora antes o despues. Roma
 * cambia y Bogota no, asi que con dos husos en juego el desfase fijo se equivoca seguro.
 *
 * NADA de esto toca `daily_entries.date`: aqui la fecha es la del calendario de la zona
 * para decidir DE QUE SEMANA hablamos, y se devuelve como string, que es como viaja
 * toda fecha de trabajo en este backend.
 */
export interface Momento {
  /** 'YYYY-MM-DD' en NOTIF_TZ. */
  fechaLocal: string;
  /** 1 = lunes ... 7 = domingo (ISO). */
  dow: number;
  /** 0..23 en NOTIF_TZ. */
  hora: number;
}

const DOW: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function momento(
  ahora: Date = new Date(), // fecha-ok: el instante del cron, jamas una fecha de trabajo
  tz: string = env.NOTIF_TZ,
): Momento {
  // 'en-GB' + estas opciones da partes numericas estables y un weekday abreviado en
  // ingles, que es lo unico que hace falta y no depende del locale del contenedor.
  const p = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    weekday: 'short',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(ahora);

  const parte = (t: string) => p.find((x) => x.type === t)?.value ?? '';
  // A las 24:00 lo llama 24 en vez de 00 en algunos runtimes; normalizar es una resta.
  const hora = Number(parte('hour')) % 24;

  return {
    fechaLocal: `${parte('year')}-${parte('month')}-${parte('day')}`,
    dow: DOW[parte('weekday')] ?? 0,
    hora,
  };
}
