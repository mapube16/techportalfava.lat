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

/** «En fabrica» es un MODIFICADOR del dia completo y del festivo: dice DONDE ocurrio. */
export const ADMITE_FABRICA: ConceptCode[] = ['DC', 'DFD'];

/** Si ESTE concepto exige proyecto. La pregunta se hace en dos pantallas. */
export const exigeProyecto = (c: ConceptCode) => !SIN_PROYECTO.includes(c);
