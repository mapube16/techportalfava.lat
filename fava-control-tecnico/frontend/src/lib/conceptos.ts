import type { ConceptCode } from './api/dailyEntries';

/**
 * Las reglas del concepto que el CLIENTE tiene que conocer.
 *
 * Vivian dentro de `LogDayDrawer`, que era su unico consumidor. La bitacora mensual
 * (BIT-11) aplica un concepto a varios dias de golpe y necesita exactamente las mismas:
 * copiarlas alli habria creado dos verdades, y la que se quedase atras solo se
 * manifestaria como un 23514 del servidor que al tecnico no le dice nada.
 */

/**
 * Los conceptos que la CHECK `de_proyecto_por_concepto` deja ir SIN proyecto. Es la
 * misma lista que el motor: si se desincronizan, el servidor rechaza con un 23514 que
 * al tecnico no le dice nada. Aqui sirve para no pedirle un proyecto que no tiene.
 */
export const SIN_PROYECTO: ConceptCode[] = ['LR', 'NR', 'IL', 'OTRO'];

/** «En fabrica» es un MODIFICADOR de los dias trabajados —completo, medio y festivo—:
    dice DONDE ocurrio. El medio dia entro el 2026-09-28: medio dia en planta es tan
    real como uno entero, y sin la casilla no habia forma de decirlo. */
export const ADMITE_FABRICA: ConceptCode[] = ['DC', 'MD', 'DFD'];

/** Lo que puede ocupar la OTRA MITAD de un medio dia: el viaje de la tarde (2026-10-09).
    No es un modificador —los conceptos son de dia, no de eventualidades—: es un segundo
    concepto de dia que solo cabe junto a MD. Misma lista que `errorMedia` y que el CHECK
    `de_media_jornada` del motor. */
export const OTRA_MITAD: ConceptCode[] = ['DVSF', 'DVRC'];

/**
 * Que se ofrece como «otra mitad» para ESTE concepto, o null si no se pregunta.
 * Desde MD: ninguna, o un viaje. Desde un viaje: ninguna, o medio dia de trabajo. La
 * pregunta se hace por los dos lados porque el tecnico puede pensar el dia como «viaje
 * salida y ademas trabaje la manana» o como «medio dia y ademas viaje»: es el mismo dia.
 */
export function opcionesMitad(concept: ConceptCode): (ConceptCode | null)[] | null {
  if (concept === 'MD') return [null, ...OTRA_MITAD];
  if (OTRA_MITAD.includes(concept)) return [null, 'MD'];
  return null;
}

/**
 * Lo que se MANDA. La forma canonica (y la unica que admite el CHECK del motor) es
 * MD + viaje: si el tecnico eligio el viaje como concepto y «medio dia de trabajo» como
 * otra mitad, se le da la vuelta aqui. Cualquier combinacion que no sea una de las dos
 * se manda sin otra mitad, en vez de dejar que el servidor la rechace.
 */
export function jornadaConMitad(concept: ConceptCode, half: ConceptCode | null) {
  if (concept === 'MD' && half && OTRA_MITAD.includes(half)) return { conceptCode: concept, halfConceptCode: half };
  if (OTRA_MITAD.includes(concept) && half === 'MD') return { conceptCode: 'MD' as ConceptCode, halfConceptCode: concept };
  return { conceptCode: concept, halfConceptCode: null };
}

/** Si ESTE concepto exige proyecto. La pregunta se hace en dos pantallas. */
export const exigeProyecto = (c: ConceptCode) => !SIN_PROYECTO.includes(c);
