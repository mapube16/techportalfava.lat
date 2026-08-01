/**
 * Los cuatro estados que comparten la nota semanal y sus jornadas, en un solo sitio.
 *
 * Viven aqui y no en `weekly-notes.service.ts` porque los usan los DOS modulos, y que
 * `daily-entries` importara de un servicio de otro dominio solo por una constante es
 * el primer paso hacia un ciclo. El mismo dominio esta escrito ademas como CHECK en la
 * migracion 20260801180000: si esta lista y aquella se separan, el motor gana.
 */
export const ESTADOS = ['draft', 'submitted', 'approved', 'returned'] as const;

export type Estado = (typeof ESTADOS)[number];

/**
 * BIT-05: en cuales puede el tecnico tocar sus jornadas. Enviado y aprobado son solo
 * lectura; devuelto vuelve a abrirse, que es el punto entero de devolver.
 */
export const EDITABLES: string[] = ['draft', 'returned'];
