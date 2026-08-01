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
    },
  });
}

/**
 * La maquina contratada. Desde la Fase 2.1 es la dueña del contrato y el ancla de los
 * dias vendidos, asi que casi ningun test de proyecto puede prescindir de ella.
 *
 * `commessa` lleva el contador porque es @unique en TODO el sistema: identifica la
 * maquina en la casa matriz, y dos tests creando «342898» chocarian.
 */
export function crearOrden(
  projectId: string,
  d: Partial<{
    label: string;
    machineModelId: string | null;
    commessa: string | null;
    commessaShort: string | null;
    oaNumber: string | null;
    contractValue: number | null;
    currencyCode: string | null;
    isActive: boolean;
  }> = {},
) {
  n += 1;
  return ownerClient.order.create({
    data: {
      projectId,
      label: d.label ?? `PL 6000 KG - ${n}`,
      machineModelId: d.machineModelId === undefined ? MAQ_TEST : d.machineModelId,
      commessa: d.commessa === undefined ? `3428${n}` : d.commessa,
      commessaShort: d.commessaShort ?? null,
      oaNumber: d.oaNumber ?? null,
      contractValue: d.contractValue ?? null,
      currencyCode: d.currencyCode === undefined ? CUR_TEST : d.currencyCode,
      isActive: d.isActive ?? true,
    },
  });
}

/**
 * Jornada APROBADA: es el unico estado que cuenta como ejecutado (coherente con KPI-01),
 * asi que es el que necesitan las pruebas de la matriz vendido/ejecutado.
 *
 * `date` es obligatoria porque `@@unique([technicianId, date])` (BIT-02) la convierte en
 * parte de la identidad: un default la haria colisionar en la segunda llamada.
 *
 * El CONCEPTO lo decide el proyecto, no el que llama. Desde el CHECK `de_proyecto_por_concepto`
 * (03-01) una jornada de trabajo SIN proyecto no existe: el motor la rechaza con 23514.
 * Con proyecto -> `DC` (dia de campo, cuenta como ejecutado); sin proyecto -> `LR`, que es
 * lo que BIT-03 dice que puede ir suelto. Antes esta funcion emitia `DC` en los dos casos,
 * o sea que fabricaba una fila imposible en cuanto le omitias el proyecto; no se veia
 * porque hasta 03-01 no habia ningun CHECK que lo dijera.
 */
export function crearJornadaAprobada(d: {
  technicianId: string;
  projectId?: string;
  /**
   * A que maquina contratada fue el dia. Omitirlo NO es un descuido: reproduce el
   * historico del Excel, donde de las 536 filas de JAV cero traen maquina, y esas
   * jornadas tienen que caer en el bucket «sin orden» en vez de desaparecer.
   */
  orderId?: string | null;
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
      orderId: d.orderId ?? null,
      roleTypeId: d.roleTypeId ?? ROL_TEST,
      phase: d.phase ?? null,
      conceptCode: d.projectId ? 'DC' : 'LR',
      machineModelId: MAQ_TEST,
    },
  });
}
