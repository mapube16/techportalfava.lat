import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * El helper que todo componente de shadcn importa: compone clases condicionales y
 * resuelve conflictos de Tailwind quedandose con la ultima (`px-2 px-4` -> `px-4`).
 * Sin `twMerge`, pasarle `className` a un componente para pisar un padding no
 * funcionaria: quedarian las dos clases y ganaria la del CSS, no la intencion.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
