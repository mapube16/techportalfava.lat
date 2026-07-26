import type { AuditRow, DayEntry, Expense, Note, Project, Tech, User } from './types';

export const CURRENT_TECH = 'Ivan Cortés';
export const MACHINES = ['CTA1000', 'PC4500', 'PL6000'];
export const CURRENCIES = ['USD', 'EUR', 'CLP', 'ARS', 'DOP'];
export const STD_HOURS_PER_DAY = 8;

export const PROJECTS: Project[] = [
  {
    id: 'p1', name: 'Molino Cibao Bocel — RD', client: 'Cibao Industrial', oa: 'OA-2451',
    country: 'República Dominicana', value: 1240000, cur: 'USD', nh: 1120, machines: ['CTA1000', 'PL6000'],
    sold: { Montaje: { Mecánico: 22, Meccatronico: 14, Eléctrico: 10 }, Collaudo: { Mecánico: 8, Meccatronico: 12, Eléctrico: 6 } },
    done: { Montaje: { Mecánico: 19, Meccatronico: 14, Eléctrico: 8 }, Collaudo: { Mecánico: 3, Meccatronico: 5, Eléctrico: 2 } },
  },
  {
    id: 'p2', name: 'Lucchetti Chile', client: 'Empresas Carozzi', oa: 'OA-2388',
    country: 'Chile', value: 2870000, cur: 'USD', nh: 2400, machines: ['PC4500', 'PL6000', 'CTA1000'],
    sold: { Montaje: { Mecánico: 30, Meccatronico: 18, Eléctrico: 16 }, Collaudo: { Mecánico: 12, Meccatronico: 16, Eléctrico: 10 } },
    done: { Montaje: { Mecánico: 31, Meccatronico: 17, Eléctrico: 16 }, Collaudo: { Mecánico: 12, Meccatronico: 15, Eléctrico: 9 } },
  },
  {
    id: 'p3', name: 'Pastificio Bariloche — AR', client: 'Molinos Bariloche S.A.', oa: 'OA-2502',
    country: 'Argentina', value: 960000, cur: 'USD', nh: 640, machines: ['PC4500'],
    sold: { Montaje: { Mecánico: 16, Meccatronico: 10, Eléctrico: 8 }, Collaudo: { Mecánico: 6, Meccatronico: 8, Eléctrico: 4 } },
    done: { Montaje: { Mecánico: 5, Meccatronico: 3, Eléctrico: 2 }, Collaudo: { Mecánico: 0, Meccatronico: 0, Eléctrico: 0 } },
  },
  {
    id: 'p4', name: 'Barilla USA — Ames', client: 'Barilla America Inc.', oa: 'OA-2410',
    country: 'Estados Unidos', value: 4150000, cur: 'USD', nh: 3600, machines: ['PL6000', 'PC4500', 'CTA1000'],
    sold: { Montaje: { Mecánico: 40, Meccatronico: 26, Eléctrico: 22 }, Collaudo: { Mecánico: 18, Meccatronico: 22, Eléctrico: 14 } },
    done: { Montaje: { Mecánico: 38, Meccatronico: 24, Eléctrico: 20 }, Collaudo: { Mecánico: 16, Meccatronico: 20, Eléctrico: 12 } },
  },
];

export const TECHS: Tech[] = [
  { n: 'Ivan Cortés', type: 'mechanic', ext: false, active: true, util: 88 },
  { n: 'Leomar Klein', type: 'mecatronic', ext: true, active: true, util: 76 },
  { n: 'Marco Ferro', type: 'electric', ext: false, active: true, util: 92 },
  { n: 'Diego Salas', type: 'mechanic', ext: false, active: true, util: 64 },
  { n: 'Anahí Rueda', type: 'mecatronic', ext: false, active: true, util: 81 },
  { n: 'Tomás Bianchi', type: 'electric', ext: true, active: false, util: 0 },
];

export const USERS: User[] = [
  { n: 'Ivan Cortés', mail: 'i.cortes@fava-la.com', roles: ['T', 'A', 'S'] },
  { n: 'Leomar Klein', mail: 'l.klein@fava-la.com', roles: ['T'] },
  { n: 'Marco Ferro', mail: 'm.ferro@fava-la.com', roles: ['T'] },
  { n: 'Giulia Rossi', mail: 'g.rossi@fava.it', roles: ['A'] },
  { n: 'Diego Salas', mail: 'd.salas@fava-la.com', roles: ['T'] },
];

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

