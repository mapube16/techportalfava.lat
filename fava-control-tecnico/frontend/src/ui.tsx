import type { ReactNode } from 'react';
import { CONCEPTS, LOCALE } from './i18n';
import type { Dict } from './i18n';
import type { Lang, NoteStatus } from './types';

/**
 * Las primitivas de la interfaz, en Tailwind.
 *
 * Los botones se exportan como CADENAS de clases y no como componentes: los usan ~40
 * sitios que ya pasan `onClick`, `disabled` y a veces un estilo puntual, y envolverlos
 * en componentes obligaría a reenviar props por gusto. `className={pbtn}` se lee igual
 * de bien y es un cambio mecánico desde `className={pbtn}`.
 *
 * MÓVIL PRIMERO, que es el orden de Tailwind y el correcto aquí: los técnicos capturan
 * desde el teléfono. `md:` significa ≥900px, o sea escritorio.
 *
 * Dos reglas de accesibilidad viajan dentro de estas cadenas y NO deben quitarse:
 *   · `min-h-11` = 44px, el mínimo táctil. En escritorio se relaja con `md:min-h-0`.
 *   · `text-base md:text-sm` en los campos: 16px en móvil es el umbral por debajo del
 *     cual Safari hace zoom al enfocar y descuadra la pantalla.
 */

/** Base común de todo lo pulsable: alineación, tipografía y el mínimo táctil. */
const BTN =
  'inline-flex items-center justify-center gap-1.5 rounded-lg font-semibold ' +
  'font-sans cursor-pointer min-h-11 md:min-h-0 transition-colors ' +
  'disabled:cursor-default disabled:opacity-50';

export const pbtn = `${BTN} px-4 py-2 text-[13.5px] bg-primary text-white border-0 hover:bg-primary-600`;
export const gbtn = `${BTN} px-3.5 py-2 text-[13px] bg-surface-2 text-ink border border-line-2 hover:bg-surface-3`;
export const wbtn = `${BTN} px-4 py-2 text-[13.5px] bg-warn text-white border-0 hover:opacity-90`;
export const sbtn = `${BTN} px-3 py-1.5 text-[12.5px] bg-accent-tint text-accent-brand border-0 hover:opacity-90`;
export const ghostBtn = `${BTN} px-2.5 py-1.5 text-[12.5px] bg-surface-2 text-ink-2 border border-line hover:bg-surface-3`;
export const ghostIconBtn =
  'inline-grid place-items-center size-11 md:size-[34px] bg-surface-2 text-ink-2 ' +
  'border border-line rounded-lg cursor-pointer hover:bg-surface-3';
/** Sobre el degradado del encabezado: blanco translúcido, no un color del tema. */
export const btnGhostLight = `${BTN} px-4 py-2 text-[13.5px] bg-white/15 text-white border border-white/35 hover:bg-white/25`;

export const th =
  'text-left px-4 py-[11px] text-[11px] font-bold text-ink-3 uppercase tracking-wider ' +
  'bg-surface-2 whitespace-nowrap';
/** `p-row` es una utilidad propia: la densidad la elige el usuario en runtime, no un breakpoint. */
export const td = 'p-row text-ink align-middle';

/**
 * `chip` NO lleva el mínimo táctil: los usos del repo son `<span>` de etiqueta, no
 * controles. Si alguno cuelga de un `onClick`, tiene que añadirlo.
 */
export const chip = 'inline-block px-2.5 py-[3px] rounded-md text-[11.5px] font-semibold font-mono bg-surface-3 text-ink-2';

export const inputStyle =
  'w-full px-3 py-2.5 min-h-11 md:min-h-0 border border-line-2 rounded-lg bg-surface-2 ' +
  'text-ink text-base md:text-sm font-sans outline-none focus:border-primary';
export const inputError = `${inputStyle.replace('border-line-2', 'border-warn')} bg-warn-tint`;

// ---- contenedores

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-surface border border-line rounded-card shadow-card ${className}`}>
      {children}
    </div>
  );
}

export function CardHead({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-[18px] py-3.5 border-b border-line">
      <div className="text-sm font-bold min-w-0">{title}</div>
      {right || null}
    </div>
  );
}

// ---- pills

export function StatusPill({ st, t }: { st: NoteStatus; t: Dict }) {
  // Tailwind no puede componer `bg-${x}` en tiempo de compilación: no vería la clase
  // al escanear y la purgaría. Las cuatro parejas van escritas enteras.
  const map: Record<NoteStatus, [string, string]> = {
    draft: ['text-draft bg-draft-tint', 'bg-draft'],
    sent: ['text-sent bg-sent-tint', 'bg-sent'],
    approved: ['text-ok bg-ok-tint', 'bg-ok'],
    returned: ['text-warn bg-warn-tint', 'bg-warn'],
  };
  const [pill, punto] = map[st];
  const lbl = { draft: t.st_draft, sent: t.st_sent, approved: t.st_approved, returned: t.st_returned }[st];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-[3px] rounded-full text-xs font-semibold ${pill}`}>
      <span className={`size-1.5 rounded-full ${punto}`} />
      {lbl}
    </span>
  );
}

export function ConceptPill({ code, lang }: { code: string; lang: Lang }) {
  const cc = CONCEPTS.find((x) => x.c === code) || CONCEPTS[0];
  return (
    <span title={cc[lang]} className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
      {/* El color del concepto es un dato del catálogo, no una clase: va en `style`
          porque Tailwind no puede generar una utilidad por cada color en runtime. */}
      <span
        className="font-mono text-[11px] font-semibold text-white px-1.5 py-0.5 rounded"
        style={{ background: cc.color }}
      >
        {code}
      </span>
      <span className="text-ink-2 font-normal">{cc[lang]}</span>
    </span>
  );
}

export function ConceptCode({ code }: { code: string }) {
  const cc = CONCEPTS.find((x) => x.c === code) || CONCEPTS[0];
  return (
    <span
      className="font-mono text-[9.5px] font-bold text-white px-1.5 py-0.5 rounded"
      style={{ background: cc.color }}
    >
      {code}
    </span>
  );
}

// ---- estado vacío

export function Empty({ icon, msg, btn, onClick }: { icon: ReactNode; msg: string; btn?: string; onClick?: () => void }) {
  return (
    <div className="grid place-items-center min-h-[50vh]">
      <div className="text-center max-w-[340px]">
        <div className="size-16 rounded-2xl bg-surface-3 text-ink-3 grid place-items-center mx-auto mb-4">
          {icon}
        </div>
        <p className="text-sm text-ink-2 leading-relaxed">{msg}</p>
        {btn ? (
          <button onClick={onClick} className={`${pbtn} mt-2`}>
            {btn}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FieldError({ msg }: { msg: string }) {
  return (
    <div className="text-[11.5px] text-warn mt-1.5 flex items-center gap-1">
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
      {msg}
    </div>
  );
}

/** Estado de carga / error de una pantalla cableada al API. */
export function ApiState({ error, label }: { error: string | null; label: string }) {
  return (
    <Card>
      <div className={`p-row text-[13px] ${error ? 'text-warn' : 'text-ink-3'}`}>
        {error ? `${label}: ${error}` : label}
      </div>
    </Card>
  );
}

// ---- formateadores
// Viven aquí y no en data.ts desde el cutover de la Fase 2: data.ts es el cajón de
// los mocks y estas tres funciones no son datos, son presentación.
export const money = (v: number, cur: string) =>
  (cur === 'USD' ? 'US$ ' : cur ? cur + ' ' : '') + v.toLocaleString('es-CL');
export const nf = (v: number) => v.toLocaleString('es-CL');

/**
 * El nombre corto del mes (1–12), del navegador y no de una tabla nuestra: con el
 * tercer idioma, mantener un array por idioma era escribir a mano lo que `Intl` ya
 * sabe. El día 15 evita el borde del huso; solo se usa para sacar la etiqueta.
 */
export const mesCorto = (n: number, lang: Lang) =>
  new Date(Date.UTC(2000, n - 1, 15)).toLocaleDateString(LOCALE[lang], { month: 'short' });
export const initials = (n: string) => n.split(' ').map((w) => w[0]).join('');

export const filterBy = <T,>(list: T[], q: string, keyFn: (it: T) => string): T[] => {
  const query = (q || '').trim().toLowerCase();
  if (!query) return list;
  return list.filter((it) => keyFn(it).toLowerCase().includes(query));
};
