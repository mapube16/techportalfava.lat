import type { AuditRow, DayEntry, Expense, Note } from './types';

/**
 * Lo que queda de mock, y la fase que retira cada cosa.
 *
 * Proyectos, técnicos, usuarios, monedas y modelos de máquina salieron de aquí en el
 * cutover de la Fase 2 (plan 02-06): esas cinco pantallas leen del API.
 *
 * | Mock                            | Lo retira                                  |
 * |---------------------------------|--------------------------------------------|
 * | `CURRENT_TECH`                  | Fase 3 — el técnico sale de `/api/me`      |
 * | ~~`MACHINES`, `LOG_PROJECTS`~~  | RETIRADOS en 03-06: el drawer usa el API   |
 * | `WEEK`                          | Fase 4/5 — `Week.tsx` ya NO lo usa (03-05),|
 * |                                 | pero siguen `Inbox.tsx` y `PdfPreview.tsx` |
 * | `NOTES`                         | Fase 4 — notas semanales y aprobación      |
 * | `EXPENSES`                      | Fase 4 — gastos de la nota                 |
 * | `AUDIT`                         | Fase 4 — `audit_log` append-only (AUD-01)  |
 */

export const CURRENT_TECH = 'Ivan Cortés';

export const NOTES: Note[] = [
  { id: 'n1', tech: 'Leomar Klein', ini: 'LK', project: 'Lucchetti Chile', week: '20–26 Jul 2026', status: 'sent', days: 7, expenses: 2, comment: '' },
  { id: 'n2', tech: 'Marco Ferro', ini: 'MF', project: 'Molino Cibao Bocel — RD', week: '20–26 Jul 2026', status: 'sent', days: 6, expenses: 1, comment: '' },
  { id: 'n3', tech: 'Diego Salas', ini: 'DS', project: 'Barilla USA — Ames', week: '20–26 Jul 2026', status: 'sent', days: 7, expenses: 4, comment: '' },
  { id: 'n4', tech: 'Anahí Rueda', ini: 'AR', project: 'Lucchetti Chile', week: '13–19 Jul 2026', status: 'approved', days: 7, expenses: 0, comment: '' },
  { id: 'n5', tech: 'Ivan Cortés', ini: 'IC', project: 'Molino Cibao Bocel — RD', week: '13–19 Jul 2026', status: 'returned', days: 5, expenses: 2, comment: 'Falta la descripción del trabajo del miércoles y el gasto de peaje sin comprobante.' },
  { id: 'n6', tech: 'Ivan Cortés', ini: 'IC', project: 'Molino Cibao Bocel — RD', week: '20–26 Jul 2026', status: 'draft', days: 4, expenses: 1, comment: '' },
];

export const WEEK: DayEntry[] = [
  { concept: 'DVSF', desc: 'Viaje Santiago → planta Cibao. Coordinación con jefe de obra.' },
  { concept: 'DC', desc: 'Montaje bancada CTA1000, alineación de rodillos y nivelación.' },
  { concept: 'DC', desc: 'Instalación grupo trafila PL6000, conexión hidráulica.' },
  { concept: 'MD', desc: 'Pruebas parciales de vacío. Media jornada por corte eléctrico planta.' },
  { concept: 'DC', desc: 'Cableado tablero de control y sensores de temperatura.' },
  { concept: 'DFD', desc: 'Sábado — trabajo festivo autorizado por cliente.' },
  { concept: 'NR', desc: 'Descanso.' },
];

export const EXPENSES: Expense[] = [
  { desc: 'Peaje autopista Duarte', date: '21 Jul', val: 'US$ 12,00' },
  { desc: 'Almuerzo en obra (2 días)', date: '22 Jul', val: 'US$ 34,50' },
];

export const AUDIT: AuditRow[] = [
  { actor: 'Giulia Rossi', act: 'approve', ent: 'Nota n°4 · A. Rueda', before: 'Enviada', after: 'Aprobada', when: '23/07 14:02' },
  { actor: 'Ivan Cortés', act: 'submit', ent: 'Nota n°6', before: 'Borrador', after: 'Enviada', when: '23/07 09:41' },
  { actor: 'Giulia Rossi', act: 'return', ent: 'Nota n°5 · I. Cortés', before: 'Enviada', after: 'Devuelta', when: '22/07 17:18' },
  { actor: 'Ivan Cortés', act: 'edit', ent: 'Proyecto Lucchetti Chile', before: 'Vendido 30d', after: 'Vendido 32d', when: '22/07 11:05' },
  { actor: 'Super Admin', act: 'grant', ent: 'Rol Admin → G. Rossi', before: '—', after: 'Admin', when: '21/07 08:30' },
  { actor: 'Marco Ferro', act: 'create', ent: 'Jornada 21/07', before: '—', after: 'DC', when: '21/07 18:22' },
];

