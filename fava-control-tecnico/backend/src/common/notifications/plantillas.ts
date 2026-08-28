/**
 * Los textos de los avisos, en los tres idiomas que ya habla la interfaz.
 *
 * DUPLICADOS a proposito respecto de `frontend/src/i18n.ts`, y no compartidos:
 * el backend no puede importar de `frontend/src` (tsconfig y build separados), y un
 * paquete de workspace para veinte cadenas es mas superficie que la duplicacion.
 * Lo que impide que deriven en la direccion que importa es el CHECK
 * `users_lang_valido` de la migracion: no puede llegar un idioma que no este aqui.
 * `plantillas.spec.ts` cubre la otra direccion (que las tres tengan las mismas claves).
 *
 * Texto plano, sin HTML: el cuerpo son cuatro lineas y un enlace, y un correo en texto
 * no se rompe en ningun cliente ni acaba en spam por el maquetado.
 */

export type Lang = 'es' | 'it' | 'pt';
export const LANGS: readonly Lang[] = ['es', 'it', 'pt'];

export type Kind = 'note_returned' | 'note_approved' | 'week_missing' | 'admin_digest';

/** Lo que cada plantilla puede pintar. Todo opcional salvo el nombre. */
export interface Datos {
  nombre: string;
  proyecto?: string;
  /** Lunes de la semana, 'YYYY-MM-DD'. Se pinta tal cual: es inequivoco en los 3 idiomas. */
  semana?: string;
  comentario?: string;
  enlace?: string;
  /** admin_digest: los nombres de quienes no enviaron, uno por linea. */
  lista?: string[];
  /** admin_digest: cuantos no tienen correo con el que avisarles. */
  inalcanzables?: string[];
}

export interface Correo {
  subject: string;
  bodyText: string;
}

type Plantilla = (d: Datos) => Correo;

/** El pie va en todos: dice quien escribe y que no se conteste. */
const PIE: Record<Lang, string> = {
  es: 'FAVA Control Técnico — mensaje automático, no respondas a este correo.',
  it: 'FAVA Control Técnico — messaggio automatico, non rispondere a questa email.',
  pt: 'FAVA Control Técnico — mensagem automática, não responda a este e-mail.',
};

const enlace = (d: Datos, texto: string) => (d.enlace ? `\n${texto}: ${d.enlace}\n` : '\n');

const T: Record<Lang, Record<Kind, Plantilla>> = {
  es: {
    note_returned: (d) => ({
      subject: `Tu nota de ${d.proyecto} fue devuelta`,
      bodyText:
        `Hola ${d.nombre}:\n\n` +
        `Tu nota de la semana del ${d.semana} (${d.proyecto}) fue devuelta para que la corrijas.\n\n` +
        `Motivo:\n${d.comentario}\n` +
        enlace(d, 'Corrígela aquí') +
        `\n${PIE.es}\n`,
    }),
    note_approved: (d) => ({
      subject: `Tu nota de ${d.proyecto} fue aprobada`,
      bodyText:
        `Hola ${d.nombre}:\n\n` +
        `Tu nota de la semana del ${d.semana} (${d.proyecto}) quedó aprobada. No tienes que hacer nada más.\n` +
        enlace(d, 'Verla') +
        `\n${PIE.es}\n`,
    }),
    week_missing: (d) => ({
      subject: `Tu semana del ${d.semana} está sin enviar`,
      bodyText:
        `Hola ${d.nombre}:\n\n` +
        `La semana del ${d.semana} sigue sin enviar. Mientras no la envíes, no se puede aprobar ni firmar.\n\n` +
        `Si la registras ahora te acordarás de lo que hiciste; el lunes ya no.\n` +
        enlace(d, 'Enviarla') +
        `\n${PIE.es}\n`,
    }),
    admin_digest: (d) => ({
      subject: `${d.lista?.length ?? 0} técnicos no enviaron la semana del ${d.semana}`,
      bodyText:
        `Semana del ${d.semana}.\n\n` +
        `Sin enviar (${d.lista?.length ?? 0}):\n${(d.lista ?? []).map((n) => `  · ${n}`).join('\n')}\n` +
        (d.inalcanzables?.length
          ? `\nAdemás, ${d.inalcanzables.length} sin correo registrado — a estos no se les pudo avisar:\n` +
            `${d.inalcanzables.map((n) => `  · ${n}`).join('\n')}\n`
          : '') +
        enlace(d, 'Abrir la bandeja') +
        `\n${PIE.es}\n`,
    }),
  },

  it: {
    note_returned: (d) => ({
      subject: `La tua nota di ${d.proyecto} è stata restituita`,
      bodyText:
        `Ciao ${d.nombre},\n\n` +
        `La tua nota della settimana del ${d.semana} (${d.proyecto}) è stata restituita per essere corretta.\n\n` +
        `Motivo:\n${d.comentario}\n` +
        enlace(d, 'Correggila qui') +
        `\n${PIE.it}\n`,
    }),
    note_approved: (d) => ({
      subject: `La tua nota di ${d.proyecto} è stata approvata`,
      bodyText:
        `Ciao ${d.nombre},\n\n` +
        `La tua nota della settimana del ${d.semana} (${d.proyecto}) è stata approvata. Non devi fare altro.\n` +
        enlace(d, 'Vedila') +
        `\n${PIE.it}\n`,
    }),
    week_missing: (d) => ({
      subject: `La tua settimana del ${d.semana} non è stata inviata`,
      bodyText:
        `Ciao ${d.nombre},\n\n` +
        `La settimana del ${d.semana} non è ancora stata inviata. Finché non la invii non può essere approvata né firmata.\n\n` +
        `Se la registri adesso ti ricordi cosa hai fatto; lunedì non più.\n` +
        enlace(d, 'Inviala') +
        `\n${PIE.it}\n`,
    }),
    admin_digest: (d) => ({
      subject: `${d.lista?.length ?? 0} tecnici non hanno inviato la settimana del ${d.semana}`,
      bodyText:
        `Settimana del ${d.semana}.\n\n` +
        `Non inviate (${d.lista?.length ?? 0}):\n${(d.lista ?? []).map((n) => `  · ${n}`).join('\n')}\n` +
        (d.inalcanzables?.length
          ? `\nInoltre, ${d.inalcanzables.length} senza email registrata — questi non sono stati avvisati:\n` +
            `${d.inalcanzables.map((n) => `  · ${n}`).join('\n')}\n`
          : '') +
        enlace(d, 'Apri la posta in arrivo') +
        `\n${PIE.it}\n`,
    }),
  },

  pt: {
    note_returned: (d) => ({
      subject: `A sua nota de ${d.proyecto} foi devolvida`,
      bodyText:
        `Olá ${d.nombre},\n\n` +
        `A sua nota da semana de ${d.semana} (${d.proyecto}) foi devolvida para correção.\n\n` +
        `Motivo:\n${d.comentario}\n` +
        enlace(d, 'Corrija aqui') +
        `\n${PIE.pt}\n`,
    }),
    note_approved: (d) => ({
      subject: `A sua nota de ${d.proyecto} foi aprovada`,
      bodyText:
        `Olá ${d.nombre},\n\n` +
        `A sua nota da semana de ${d.semana} (${d.proyecto}) foi aprovada. Não precisa fazer mais nada.\n` +
        enlace(d, 'Ver') +
        `\n${PIE.pt}\n`,
    }),
    week_missing: (d) => ({
      subject: `A sua semana de ${d.semana} não foi enviada`,
      bodyText:
        `Olá ${d.nombre},\n\n` +
        `A semana de ${d.semana} continua sem ser enviada. Enquanto não a enviar, não pode ser aprovada nem assinada.\n\n` +
        `Se registar agora ainda se lembra do que fez; na segunda-feira já não.\n` +
        enlace(d, 'Enviar') +
        `\n${PIE.pt}\n`,
    }),
    admin_digest: (d) => ({
      subject: `${d.lista?.length ?? 0} técnicos não enviaram a semana de ${d.semana}`,
      bodyText:
        `Semana de ${d.semana}.\n\n` +
        `Sem enviar (${d.lista?.length ?? 0}):\n${(d.lista ?? []).map((n) => `  · ${n}`).join('\n')}\n` +
        (d.inalcanzables?.length
          ? `\nAlém disso, ${d.inalcanzables.length} sem e-mail registado — estes não puderam ser avisados:\n` +
            `${d.inalcanzables.map((n) => `  · ${n}`).join('\n')}\n`
          : '') +
        enlace(d, 'Abrir a caixa') +
        `\n${PIE.pt}\n`,
    }),
  },
};

/** Idioma valido o `es`. El CHECK de la migracion lo garantiza, pero el historico
    o un `lang` leido de otro sitio no tienen por que: mejor castellano que undefined. */
export const idioma = (v: string | null | undefined): Lang =>
  (LANGS as readonly string[]).includes(v ?? '') ? (v as Lang) : 'es';

export function render(kind: Kind, lang: Lang, datos: Datos): Correo {
  return T[lang][kind](datos);
}

/** Solo para el test que compara las tres lenguas. */
export const PLANTILLAS = T;
