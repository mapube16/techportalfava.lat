/**
 * Los correos que manda la aplicacion: QUE dicen, en tres idiomas, y como se pintan.
 *
 * UNA FUENTE, DOS SALIDAS. Cada plantilla devuelve una ESTRUCTURA —saludo, parrafos,
 * un destacado, una lista, un boton— y de ahi salen el texto plano y el HTML. Escribir
 * los dos a mano habria sido escribir quince correos dos veces (5 avisos x 3 idiomas),
 * y el dia que alguien corrigiera una frase la corregiria en uno solo: el que no lee
 * nadie se quedaria atras y nadie se enteraria hasta recibirlo.
 *
 * EL TEXTO PLANO NO ES UN RESTO. Va SIEMPRE como alternativa: hay clientes que
 * bloquean HTML, y un correo que solo es HTML se ve vacio en ellos.
 *
 * EL HTML VIVE CON LAS REGLAS DEL CORREO, que no son las de la web:
 *   · Maquetado con <table>. Outlook usa el motor de Word: flexbox y grid no existen.
 *   · Todo el CSS EN LINEA. Gmail tira los <style> del head.
 *   · Sin imagenes ni fuentes remotas: muchos clientes las bloquean y el correo tiene
 *     que funcionar igual, asi que el membrete es texto.
 *   · El boton es un <a> con relleno: un <button> no se pinta.
 *   · Fondos explicitos en todo lo que lleve texto, o el modo oscuro lo deja ilegible.
 */

export type Lang = 'es' | 'it' | 'pt';
export const LANGS: readonly Lang[] = ['es', 'it', 'pt'];

export type Kind =
  | 'note_returned'
  | 'note_approved'
  | 'week_missing'
  | 'admin_digest'
  /**
   * CAT-02c. El unico que NO lo dispara un reloj ni una transicion: lo manda un admin
   * a proposito, pulsando «Invitar». Por eso no lleva ventana ni cron — y por eso
   * ningun correo sale hasta que una persona decide que salga.
   */
  | 'invitacion';

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
  /** invitacion: quien le da el acceso. Un correo de una persona se lee distinto que uno de un sistema. */
  invitadoPor?: string;
}

/**
 * Lo que un aviso DICE, sin decidir como se ve.
 *
 * Es la pieza que permite tener texto y HTML sin escribirlos dos veces. Deliberadamente
 * pobre: cinco huecos y ni uno mas. En cuanto una plantilla necesite algo que no cabe
 * aqui, la respuesta correcta es discutir si ese correo debe decir eso, no ampliar la
 * estructura hasta que quepa cualquier cosa.
 */
interface Cuerpo {
  /** «Hola Marco:» — con su puntuacion, que cambia por idioma. */
  saludo: string;
  parrafos: string[];
  /** Lo que no se puede pasar por alto: el motivo de una devolucion, «no hay contraseña». */
  destacado?: string;
  /** Listas con titulo. El resumen de los lunes lleva dos: los que faltan y los inalcanzables. */
  listas?: { titulo: string; items: string[] }[];
  /** El texto del boton. El destino sale de `datos.enlace`; sin enlace no se pinta. */
  boton?: string;
}

export interface Correo {
  subject: string;
  bodyText: string;
  bodyHtml: string;
}

type Plantilla = (d: Datos) => { subject: string; cuerpo: Cuerpo };

/** El pie va en todos: dice quien escribe y que no se conteste. */
const PIE: Record<Lang, string> = {
  es: 'FAVA Control Técnico — mensaje automático, no respondas a este correo.',
  it: 'FAVA Control Técnico — messaggio automatico, non rispondere a questa email.',
  pt: 'FAVA Control Técnico — mensagem automática, não responda a este e-mail.',
};

// ── Los colores de la aplicacion, no unos inventados para el correo ──
const AZUL = '#104a78';
const TEXTO = '#132330';
const SUAVE = '#5b6b7a';
const FONDO = '#eef2f5';
const PAPEL = '#ffffff';
const BORDE = '#dde3e9';
const NARANJA = '#e86c00';
const TIPO = "Roboto, 'Helvetica Neue', Helvetica, Arial, sans-serif";

/**
 * Escapa lo que va dentro del HTML. TODO lo que pinta un correo sale de la base —
 * nombres de proyecto, comentarios de devolucion escritos por un admin— y un `<` suelto
 * en un motivo de devolucion romperia la maqueta o algo peor.
 */
const esc = (s: string) =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ── Salida 1: texto plano ──

function aTexto(c: Cuerpo, d: Datos, lang: Lang): string {
  const partes = [c.saludo, '', ...c.parrafos];
  if (c.destacado) partes.push('', c.destacado);
  for (const l of c.listas ?? []) {
    partes.push('', `${l.titulo}:`, ...l.items.map((i) => `  · ${i}`));
  }
  if (c.boton && d.enlace) partes.push('', `${c.boton}: ${d.enlace}`);
  partes.push('', PIE[lang]);
  return partes.join('\n') + '\n';
}

// ── Salida 2: HTML ──

const parrafo = (t: string) =>
  `<p style="margin:0 0 14px;font:16px/1.6 ${TIPO};color:${TEXTO};">${esc(t)}</p>`;

/** El aviso que no se puede pasar por alto: barra de color a la izquierda y fondo propio. */
const destacado = (t: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">` +
  `<tr><td style="background:${FONDO};border-left:4px solid ${NARANJA};padding:14px 16px;` +
  `font:16px/1.55 ${TIPO};color:${TEXTO};">${esc(t)}</td></tr></table>`;

const lista = (titulo: string, items: string[]) =>
  `<p style="margin:0 0 8px;font:13px/1.4 ${TIPO};color:${SUAVE};` +
  `text-transform:uppercase;letter-spacing:.05em;font-weight:700;">${esc(titulo)}</p>` +
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">` +
  items
    .map(
      (i) =>
        `<tr><td style="padding:7px 0;border-bottom:1px solid ${BORDE};` +
        `font:15px/1.4 ${TIPO};color:${TEXTO};">${esc(i)}</td></tr>`,
    )
    .join('') +
  `</table>`;

/** `<a>` y no `<button>`: un boton de formulario no se pinta en la mayoria de clientes. */
const boton = (texto: string, href: string) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 4px;">` +
  `<tr><td style="background:${AZUL};border-radius:6px;">` +
  `<a href="${esc(href)}" style="display:inline-block;padding:13px 26px;font:600 16px/1 ${TIPO};` +
  `color:${PAPEL};text-decoration:none;">${esc(texto)}</a>` +
  `</td></tr></table>` +
  // El enlace en claro debajo: si el boton no se pinta o alguien reenvia el correo en
  // texto, la direccion tiene que seguir estando.
  `<p style="margin:10px 0 0;font:13px/1.5 ${TIPO};color:${SUAVE};word-break:break-all;">${esc(href)}</p>`;

/**
 * El origen desde el que se sirven las imagenes del correo.
 *
 * Sale del enlace que YA lleva el aviso, no de una variable nueva: las imagenes las
 * sirve la misma aplicacion, asi que si sabemos a donde mandar al usuario sabemos de
 * donde bajarlas. Sin enlace no se pintan — un correo con las imagenes rotas es peor
 * que uno sin ellas.
 */
function origen(d: Datos): string | null {
  if (!d.enlace) return null;
  try {
    return new URL(d.enlace).origin;
  } catch {
    return null;
  }
}

/**
 * El membrete: el logotipo sobre blanco y la foto debajo.
 *
 * SOBRE BLANCO Y NO SOBRE EL AZUL porque el logotipo es azul oscuro: en la banda
 * `#104a78` desapareceria. Va con su color real, que es como debe ir una marca.
 *
 * Y TODO ESTO ES PRESCINDIBLE. Outlook y Gmail bloquean las imagenes por defecto:
 * media plantilla puede no llegar a verse nunca. Por eso el `alt` del logotipo es el
 * nombre completo —con las imagenes apagadas se lee «FAVA LatinoAmérica», no un
 * recuadro vacio— y la foto se omite entera si no hay de donde bajarla.
 *
 * `width` y `height` como ATRIBUTOS y no solo en el CSS: Outlook ignora el estilo al
 * calcular el hueco y descoloca la maqueta.
 */
function membrete(d: Datos): string {
  const base = origen(d);
  const blanco =
    `<tr><td style="background:${PAPEL};padding:20px 28px 16px;border-radius:9px 9px 0 0;">` +
    (base
      ? `<img src="${esc(base)}/email/logo.png" width="150" height="76" alt="FAVA LatinoAmérica" ` +
        `style="display:block;border:0;width:150px;height:auto;">`
      : `<span style="font:700 17px/1.2 ${TIPO};color:${AZUL};">FAVA</span>` +
        `<span style="font:400 17px/1.2 ${TIPO};color:${SUAVE};"> Control Técnico</span>`) +
    `</td></tr>`;

  const foto = base
    ? `<tr><td style="background:${AZUL};font-size:0;line-height:0;">` +
      `<img src="${esc(base)}/email/hero.jpg" width="600" height="180" alt="" ` +
      `style="display:block;border:0;width:100%;max-width:600px;height:auto;"></td></tr>`
    : '';

  return blanco + foto;
}

function aHtml(c: Cuerpo, d: Datos, lang: Lang): string {
  const dentro =
    `<p style="margin:0 0 16px;font:600 18px/1.4 ${TIPO};color:${TEXTO};">${esc(c.saludo)}</p>` +
    c.parrafos.map(parrafo).join('') +
    (c.destacado ? destacado(c.destacado) : '') +
    (c.listas ?? []).map((l) => lista(l.titulo, l.items)).join('') +
    (c.boton && d.enlace ? boton(c.boton, d.enlace) : '');

  return (
    `<!doctype html><html lang="${lang}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width"></head>` +
    `<body style="margin:0;padding:0;background:${FONDO};">` +
    // La tabla exterior centra en Outlook, que ignora `margin:auto`.
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${FONDO};">` +
    `<tr><td align="center" style="padding:28px 12px;">` +
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" ` +
    `style="width:100%;max-width:600px;background:${PAPEL};border:1px solid ${BORDE};border-radius:10px;">` +
    membrete(d) +
    `<tr><td style="padding:26px 28px 22px;">${dentro}</td></tr>` +
    `<tr><td style="padding:16px 28px 20px;border-top:1px solid ${BORDE};">` +
    `<p style="margin:0;font:13px/1.5 ${TIPO};color:${SUAVE};">${esc(PIE[lang])}</p>` +
    `</td></tr></table></td></tr></table></body></html>`
  );
}

// ── Que dice cada aviso ──

const T: Record<Lang, Record<Kind, Plantilla>> = {
  es: {
    note_returned: (d) => ({
      subject: `Tu nota de ${d.proyecto} fue devuelta`,
      cuerpo: {
        saludo: `Hola ${d.nombre}:`,
        parrafos: [
          `Tu nota de la semana del ${d.semana} (${d.proyecto}) fue devuelta para que la corrijas.`,
        ],
        destacado: `Motivo: ${d.comentario}`,
        boton: 'Corrígela aquí',
      },
    }),
    /**
     * NO explica como crear una cuenta, porque no hay ninguna que crear: se entra con
     * el Microsoft corporativo que la persona ya usa y el primer acceso la reconoce
     * sola (`EntraGuard.vincular`). Un correo que dijera «registrate» mandaria a
     * alguien a buscar un formulario que no existe — por eso eso va en el DESTACADO.
     */
    invitacion: (d) => ({
      subject: 'Tienes acceso a FAVA Control Técnico',
      cuerpo: {
        saludo: `Hola ${d.nombre}:`,
        parrafos: [
          `${d.invitadoPor} te dio acceso a FAVA Control Técnico, donde vas a registrar tus días de trabajo y firmar tu nota semanal.`,
        ],
        destacado: 'Entra con tu correo de FAVA. No tienes que crear ninguna contraseña.',
        boton: 'Entrar',
      },
    }),
    note_approved: (d) => ({
      subject: `Tu nota de ${d.proyecto} fue aprobada`,
      cuerpo: {
        saludo: `Hola ${d.nombre}:`,
        parrafos: [
          `Tu nota de la semana del ${d.semana} (${d.proyecto}) quedó aprobada. No tienes que hacer nada más.`,
        ],
        boton: 'Verla',
      },
    }),
    week_missing: (d) => ({
      subject: `Tu semana del ${d.semana} está sin enviar`,
      cuerpo: {
        saludo: `Hola ${d.nombre}:`,
        parrafos: [
          `La semana del ${d.semana} sigue sin enviar. Mientras no la envíes, no se puede aprobar ni firmar.`,
          'Si la registras ahora te acordarás de lo que hiciste; el lunes ya no.',
        ],
        boton: 'Enviarla',
      },
    }),
    admin_digest: (d) => ({
      subject: `${d.lista?.length ?? 0} técnicos no enviaron la semana del ${d.semana}`,
      cuerpo: {
        saludo: `Semana del ${d.semana}.`,
        parrafos: [],
        listas: [
          { titulo: `Sin enviar (${d.lista?.length ?? 0})`, items: d.lista ?? [] },
          ...(d.inalcanzables?.length
            ? [
                {
                  titulo: `Sin correo registrado (${d.inalcanzables.length}) — a estos no se les pudo avisar`,
                  items: d.inalcanzables,
                },
              ]
            : []),
        ],
        boton: 'Abrir la bandeja',
      },
    }),
  },

  it: {
    note_returned: (d) => ({
      subject: `La tua nota di ${d.proyecto} è stata restituita`,
      cuerpo: {
        saludo: `Ciao ${d.nombre},`,
        parrafos: [
          `La tua nota della settimana del ${d.semana} (${d.proyecto}) è stata restituita per essere corretta.`,
        ],
        destacado: `Motivo: ${d.comentario}`,
        boton: 'Correggila qui',
      },
    }),
    invitacion: (d) => ({
      subject: 'Hai accesso a FAVA Control Técnico',
      cuerpo: {
        saludo: `Ciao ${d.nombre},`,
        parrafos: [
          `${d.invitadoPor} ti ha dato accesso a FAVA Control Técnico, dove registrerai le tue giornate di lavoro e firmerai la nota settimanale.`,
        ],
        destacado: 'Entra con la tua email FAVA. Non devi creare nessuna password.',
        boton: 'Entra',
      },
    }),
    note_approved: (d) => ({
      subject: `La tua nota di ${d.proyecto} è stata approvata`,
      cuerpo: {
        saludo: `Ciao ${d.nombre},`,
        parrafos: [
          `La tua nota della settimana del ${d.semana} (${d.proyecto}) è stata approvata. Non devi fare altro.`,
        ],
        boton: 'Vedila',
      },
    }),
    week_missing: (d) => ({
      subject: `La tua settimana del ${d.semana} non è stata inviata`,
      cuerpo: {
        saludo: `Ciao ${d.nombre},`,
        parrafos: [
          `La settimana del ${d.semana} non è ancora stata inviata. Finché non la invii non può essere approvata né firmata.`,
          'Se la registri adesso ti ricordi cosa hai fatto; lunedì non più.',
        ],
        boton: 'Inviala',
      },
    }),
    admin_digest: (d) => ({
      subject: `${d.lista?.length ?? 0} tecnici non hanno inviato la settimana del ${d.semana}`,
      cuerpo: {
        saludo: `Settimana del ${d.semana}.`,
        parrafos: [],
        listas: [
          { titulo: `Non inviate (${d.lista?.length ?? 0})`, items: d.lista ?? [] },
          ...(d.inalcanzables?.length
            ? [
                {
                  titulo: `Senza email registrata (${d.inalcanzables.length}) — questi non sono stati avvisati`,
                  items: d.inalcanzables,
                },
              ]
            : []),
        ],
        boton: 'Apri la posta in arrivo',
      },
    }),
  },

  pt: {
    note_returned: (d) => ({
      subject: `A sua nota de ${d.proyecto} foi devolvida`,
      cuerpo: {
        saludo: `Olá ${d.nombre},`,
        parrafos: [
          `A sua nota da semana de ${d.semana} (${d.proyecto}) foi devolvida para correção.`,
        ],
        destacado: `Motivo: ${d.comentario}`,
        boton: 'Corrija aqui',
      },
    }),
    invitacion: (d) => ({
      subject: 'Você tem acesso ao FAVA Control Técnico',
      cuerpo: {
        saludo: `Olá ${d.nombre},`,
        parrafos: [
          `${d.invitadoPor} liberou o seu acesso ao FAVA Control Técnico, onde você vai registrar os seus dias de trabalho e assinar a nota semanal.`,
        ],
        destacado: 'Entre com o seu e-mail da FAVA. Não precisa criar nenhuma senha.',
        boton: 'Entrar',
      },
    }),
    note_approved: (d) => ({
      subject: `A sua nota de ${d.proyecto} foi aprovada`,
      cuerpo: {
        saludo: `Olá ${d.nombre},`,
        parrafos: [
          `A sua nota da semana de ${d.semana} (${d.proyecto}) foi aprovada. Não precisa fazer mais nada.`,
        ],
        boton: 'Ver',
      },
    }),
    week_missing: (d) => ({
      subject: `A sua semana de ${d.semana} não foi enviada`,
      cuerpo: {
        saludo: `Olá ${d.nombre},`,
        parrafos: [
          `A semana de ${d.semana} continua sem ser enviada. Enquanto não a enviar, não pode ser aprovada nem assinada.`,
          'Se registar agora ainda se lembra do que fez; na segunda-feira já não.',
        ],
        boton: 'Enviar',
      },
    }),
    admin_digest: (d) => ({
      subject: `${d.lista?.length ?? 0} técnicos não enviaram a semana de ${d.semana}`,
      cuerpo: {
        saludo: `Semana de ${d.semana}.`,
        parrafos: [],
        listas: [
          { titulo: `Sem enviar (${d.lista?.length ?? 0})`, items: d.lista ?? [] },
          ...(d.inalcanzables?.length
            ? [
                {
                  titulo: `Sem e-mail registado (${d.inalcanzables.length}) — estes não puderam ser avisados`,
                  items: d.inalcanzables,
                },
              ]
            : []),
        ],
        boton: 'Abrir a caixa de entrada',
      },
    }),
  },
};

export const PLANTILLAS = T;

/**
 * El idioma guardado, o español si trae cualquier otra cosa.
 *
 * Acepta `unknown` a proposito: el valor viene de una columna, y un `null` o un
 * `pt-BR` tienen que caer a castellano en vez de reventar el envio de un correo.
 */
export const idioma = (s: unknown): Lang => (LANGS.includes(s as Lang) ? (s as Lang) : 'es');

export function render(kind: Kind, lang: Lang, datos: Datos): Correo {
  const { subject, cuerpo } = T[lang][kind](datos);
  return { subject, bodyText: aTexto(cuerpo, datos, lang), bodyHtml: aHtml(cuerpo, datos, lang) };
}
