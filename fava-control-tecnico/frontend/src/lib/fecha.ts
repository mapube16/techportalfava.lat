/** Stub en rojo: las firmas del contrato, sin implementacion. */
const SIN = () => {
  throw new Error('sin implementar');
};

export const hoyLocal = (_ahora: Date = new Date()): string => SIN();
export const sumarDias = (_s: string, _n: number): string => SIN();
export const lunesDe = (_s: string): string => SIN();
export const diasDeSemana = (_lunes: string): string[] => SIN();
export const primerDiaMesAnterior = (_hoy: string): string => SIN();
