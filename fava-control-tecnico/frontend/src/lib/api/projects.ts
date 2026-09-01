import { apiFetch, apiSend } from './client';

// Contrato cerrado de 02-05, corregido en 02.1: la dueña del contrato es la ORDEN
// (la máquina contratada), no el proyecto. Roles A · S.

export type Phase = 'MONTAJE' | 'COLLAUDO';

export interface ProjectListItem {
  id: string;
  name: string;
  clientName: string;
  country: string;
  contractNumber: string;
  /**
   * SUMA de las órdenes, no una columna del proyecto: JAV tiene tres máquinas con tres
   * importes distintos y J Macedo ninguno a nivel de proyecto. `number`, no string: el
   * servicio convierte el Decimal de Prisma (hallazgo 02-05).
   */
  contractValue: number;
  /** `null` si las órdenes mezclan monedas: sumarlas y etiquetarlas sería una cifra falsa. */
  currencyCode: string | null;
  normalHours: number | null;
  isActive: boolean;
  /** Etiquetas de las órdenes, ordenadas, listas para los chips. */
  machineCodes: string[];
}

export interface MatrixRow {
  roleTypeId: string;
  roleTypeName: string;
  /** false = rol de baja que sigue apareciendo porque tiene datos. */
  roleTypeActive: boolean;
  /** null = bucket «sin fase» (histórico del Excel). */
  phase: Phase | null;
  sold: number;
  executed: number;
  /**
   * `sold − executed`, calculado por el servidor en la ÚNICA línea del repo que resta
   * estas dos cantidades. Negativo = sobreejecución. El cliente NO resta.
   */
  delta: number;
}

/**
 * La máquina contratada. Dos órdenes del mismo modelo conviven si su commessa las
 * distingue: JAV tiene dos `PL 6000 KG` que solo se diferencian en 3428 vs 3429.
 */
export interface Order {
  id: string;
  /** Lo que el técnico ve al elegir: «PL 6000 KG - 1-3428». */
  label: string;
  machineModelId: string | null;
  /** La larga («342898»), única en todo el sistema. */
  commessa: string | null;
  /** Los 4 primeros dígitos («3428»): como se nombra la máquina en obra. */
  commessaShort: string | null;
  oaNumber: string | null;
  /** El importe RESERVADO, no la suma de las líneas de la cotización. */
  contractValue: number | null;
  currencyCode: string | null;
  isActive: boolean;
  /** Su propia matriz vendido/ejecutado/delta, como cada bloque de la hoja del Excel. */
  matrix: MatrixRow[];
}

/**
 * Jornadas aprobadas del proyecto que no dicen a qué orden fueron. Es el estado en el
 * que entra todo el histórico del Excel, y se muestra en vez de repartirse: repartir a
 * ojo es justo el trabajo manual que esta app elimina.
 */
export interface UnassignedRow {
  roleTypeId: string;
  roleTypeName: string;
  phase: Phase | null;
  executed: number;
}

export interface Project {
  id: string;
  name: string;
  // Encabezado literal de la Nota Semanal
  clientName: string;
  /** OJO Fase 5: el «NIT:» del PDF es el de FAVA, no este. */
  clientNit: string | null;
  locality: string;
  country: string;
  supply: string;
  contractNumber: string;
  normalHours: number | null;
  isActive: boolean;
  orders: Order[];
  unassigned: UnassignedRow[];
}

export interface ProjectInput {
  name: string;
  clientName: string;
  locality: string;
  country: string;
  supply: string;
  contractNumber: string;
  clientNit?: string | null;
  normalHours?: number | null;
}

/** Lo comercial va en la orden. `label` es lo único obligatorio al crearla. */
export interface OrderInput {
  label: string;
  machineModelId?: string | null;
  /**
   * El modelo por CODIGO, escrito a mano. El servidor lo busca en el catálogo (sin
   * distinguir mayúsculas) y lo crea si no existe: una máquina nueva ya no obliga a
   * salir a Configuración en mitad del alta del proyecto.
   */
  machineModel?: string | null;
  commessa?: string | null;
  commessaShort?: string | null;
  oaNumber?: string | null;
  contractValue?: number | null;
  currencyCode?: string | null;
  isActive?: boolean;
}

/** Respuesta del autoguardado de una celda: trae el delta ya calculado. */
export interface SoldDaysCell {
  roleTypeId: string;
  phase: Phase | null;
  sold: number;
  executed: number;
  delta: number;
}

/** ORDER BY name, incluye inactivos: filtra el selector, no el endpoint. */
export const listProjects = () => apiFetch<ProjectListItem[]>('/projects');

export const getProject = (id: string) => apiFetch<Project>(`/projects/${id}`);

/** POST y PATCH devuelven el proyecto SIN `orders` ni `unassigned`: eso es del GET. */
export const createProject = (body: ProjectInput) => apiSend<Project>('/projects', 'POST', body);

export const updateProject = (id: string, body: Partial<ProjectInput>) =>
  apiSend<Project>(`/projects/${id}`, 'PATCH', body);

export const setProjectActive = (id: string, isActive: boolean) =>
  apiSend<Project>(`/projects/${id}/active`, 'PATCH', { isActive });

// ── Órdenes. CRUD de verdad y no un «reemplazar la selección»: la orden lleva
//    commessa, OA e importe, y reemplazarla entera perdería datos.

export const createOrder = (projectId: string, body: OrderInput) =>
  apiSend<Omit<Order, 'matrix'>>(`/projects/${projectId}/orders`, 'POST', body);

export const updateOrder = (orderId: string, body: Partial<OrderInput>) =>
  apiSend<Omit<Order, 'matrix'>>(`/orders/${orderId}`, 'PATCH', body);

/**
 * Falla con 400 si la orden tiene bitácora o días vendidos. Va por `apiFetch` y no por
 * `apiSend` porque el DELETE no lleva cuerpo — y ampliar `apiSend` para admitirlo
 * obligaría a hacer opcional el `body` de los otros tres métodos, donde sí es obligatorio.
 */
export const deleteOrder = (orderId: string) =>
  apiFetch<{ id: string }>(`/orders/${orderId}`, { method: 'DELETE' });

/** UNA celda: es el endpoint del autoguardado al salir del campo. */
export const setSoldDays = (
  orderId: string,
  body: { roleTypeId: string; phase: Phase; soldDays: number },
) => apiSend<SoldDaysCell>(`/orders/${orderId}/sold-days`, 'PUT', body);
