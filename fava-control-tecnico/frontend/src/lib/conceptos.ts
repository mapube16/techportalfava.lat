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

/** Si ESTE concepto exige proyecto. La pregunta se hace en dos pantallas. */
export const exigeProyecto = (c: ConceptCode) => !SIN_PROYECTO.includes(c);
