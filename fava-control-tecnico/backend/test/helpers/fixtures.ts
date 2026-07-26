/**
 * Fixtures de los maestros de la Fase 2. Contrato CERRADO: lo consumen las waves 2 y 3
 * y ningun plan posterior lo modifica — si a un spec le falta un fixture, se lo define
 * en su propio archivo. Asi dos planes en paralelo no se pisan este archivo.
 *
 * Todo se siembra con `ownerClient` (superusuario, salta RLS): los fixtures no son el
 * sujeto del test. Lo que se prueba conectado como fava_app es el codigo, no la siembra.
 *
 * Precondicion: `truncateAll()` (deja los catalogos y TEC_A/TEC_B garantizados).
 */
import { CUR_TEST, MAQ_TEST, ROL_TEST, ownerClient } from './db';

/** Contador de proceso: nombres y contratos distinguibles sin colisionar entre llamadas. */
let n = 0;

export function crearTecnico(
  d: Partial<{
    fullName: string;
    roleTypeId: string;
    employmentType: 'INTERNO' | 'EXTERNO';
    isActive: boolean;
  }> = {},
) {
  n += 1;
  return ownerClient.technician.create({
    data: {
      fullName: d.fullName ?? `Tecnico ${n}`,
      roleTypeId: d.roleTypeId ?? ROL_TEST,
      employmentType: d.employmentType ?? 'INTERNO',
      isActive: d.isActive ?? true,
    },
  });
}

/**
 * Proyecto con los 7 campos del encabezado de la Nota rellenos: un proyecto a medias
 * no sirve para probar la Fase 5, y estos campos son NOT NULL en el esquema.
 */
export function crearProyecto(
  d: Partial<{
    name: string;
    clientName: string;
    locality: string;
    country: string;
    supply: string;
    contractNumber: string;
    currencyCode: string | null;
  }> = {},
) {
  n += 1;
  return ownerClient.project.create({
    data: {
      name: d.name ?? `Proyecto ${n}`,
      clientName: d.clientName ?? `Cliente ${n}`,
      locality: d.locality ?? 'Santiago de los Caballeros',
      country: d.country ?? 'Republica Dominicana',
      supply: d.supply ?? 'Instalación Eléctrica',
      contractNumber: d.contractNumber ?? `34550${n}`,
      currencyCode: d.currencyCode === undefined ? CUR_TEST : d.currencyCode,
    },
  });
}

/**
 * Jornada APROBADA: es el unico estado que cuenta como ejecutado (coherente con KPI-01),
 * asi que es el que necesitan las pruebas de la matriz vendido/ejecutado.
 *
 * `date` es obligatoria porque `@@unique([technicianId, date])` (BIT-02) la convierte en
 * parte de la identidad: un default la haria colisionar en la segunda llamada.
 */
export function crearJornadaAprobada(d: {
  technicianId: string;
  projectId?: string;
  roleTypeId?: string;
  phase?: 'MONTAJE' | 'COLLAUDO' | null;
  date: Date;
}) {
  return ownerClient.dailyEntry.create({
    data: {
      technicianId: d.technicianId,
      date: d.date,
      status: 'approved',
      projectId: d.projectId ?? null,
      roleTypeId: d.roleTypeId ?? ROL_TEST,
      phase: d.phase ?? null,
      conceptCode: 'DC',
      machineModelId: MAQ_TEST,
    },
  });
}
