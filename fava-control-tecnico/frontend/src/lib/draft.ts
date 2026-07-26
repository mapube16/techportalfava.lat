/** Stub en rojo: el contrato del borrador, sin implementacion. */
export interface FilaDia {
  date: string;
  projectId: string | null;
  machineModelId: string | null;
  conceptCode: string | null;
  phase: 'MONTAJE' | 'COLLAUDO' | null;
  description: string | null;
}

export interface Borrador {
  entries: Record<string, FilaDia>;
  savedAt: number;
}

const SIN = (): never => {
  throw new Error('sin implementar');
};

export const claveBorrador = (_technicianId: string, _lunes: string): string => SIN();
export function guardar(_st: Storage, _clave: string, _b: Borrador): boolean {
  return SIN();
}
export function leer(_st: Storage, _clave: string): Borrador | null {
  return SIN();
}
export function borrar(_st: Storage, _clave: string): void {
  return SIN();
}
export function enConflicto(_b: Borrador, _servidor: { date: string; updatedAt: string }[]): string[] {
  return SIN();
}
