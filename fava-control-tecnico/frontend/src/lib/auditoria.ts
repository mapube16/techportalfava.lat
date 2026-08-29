/**
 * AUD-02 — de la fila del log a una frase.
 *
 * Vive aquí y no dentro de `Audit.tsx` por lo de siempre: es la única parte de esa
 * pantalla con lógica de verdad —el diff de gastos, que es donde hay plata— y aquí se
 * prueba con `node --test` sin DOM simulado, igual que `draft.ts`.
 *
 * No importa nada del API ni del diccionario: recibe las dos formas que necesita por
 * parámetro. `AuditRow` y `Dict` las cumplen estructuralmente, así que la pantalla les
 * pasa lo suyo sin castear y el test escribe un `t` de catorce palabras en vez de
 * falsificar el diccionario entero.
 */

export interface Gasto {
  descripcion: string;
  valor: string;
}

/** Lo que la frase necesita de una fila del log. `AuditRow` lo cumple. */
export interface Fila {
  entity: string;
  action: string;
  before: unknown;
  after: unknown;
}

/** Las palabras. `Dict` las cumple. */
export interface Voz {
  aud_submit: string;
  aud_approve: string;
  aud_return: string;
  aud_reopen: string;
  aud_sign: string;
  aud_update: string;
  aud_deactivate: string;
  aud_reactivate: string;
  aud_role: string;
  aud_added: string;
  aud_removed: string;
  aud_changed: string;
  expenses: string;
  advances: string;
}

/** El log guarda JSON suelto: nada garantiza la forma, así que nada se asume. */
const campo = (o: unknown, k: string): unknown =>
  o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined;

const gastosDe = (o: unknown, k: string): Gasto[] => {
  const v = campo(o, k);
  return Array.isArray(v) ? (v as Gasto[]) : [];
};

/** Diferencia de multiconjuntos: lo de `a` que no está en `b`, contando repetidos. */
const restar = (a: Gasto[], b: Gasto[]): Gasto[] => {
  const resto = [...b];
  return a.filter((g) => {
    const i = resto.findIndex((h) => h.descripcion === g.descripcion && h.valor === g.valor);
    if (i < 0) return true;
    resto.splice(i, 1);
    return false;
  });
};

const cita = (g: Gasto) => (g.descripcion ? `«${g.descripcion}» ${g.valor}` : g.valor);

/**
 * Un bloque de gastos contado como UN cambio, no como dos volcados.
 *
 * La pantalla escribía los dos arrays enteros a lado y lado y había que compararlos a
 * ojo para descubrir que se borró un gasto de 50.000. Aquí se dice qué se movió.
 *
 * Se emparejan por descripción antes de listar altas y bajas: corregir 50.000 por
 * 60.000 es un cambio, y contarlo como «quitó Transporte · añadió Transporte» obliga a
 * leer dos veces para entender que hablan del mismo gasto.
 *
 * Devuelve '' cuando no cambió nada — reordenar no es un cambio, y un log que inventa
 * movimientos que no hubo es peor que uno callado.
 */
export const diffGastos = (etiqueta: string, antes: Gasto[], despues: Gasto[], t: Voz): string => {
  const quitados = restar(antes, despues);
  const anadidos = restar(despues, antes);
  if (!quitados.length && !anadidos.length) return '';

  const partes: string[] = [];
  for (const q of [...quitados]) {
    const i = anadidos.findIndex((a) => a.descripcion === q.descripcion);
    if (i < 0) continue;
    const d = q.descripcion ? `«${q.descripcion}» ` : '';
    partes.push(`${t.aud_changed} ${d}${q.valor} → ${anadidos[i].valor}`);
    anadidos.splice(i, 1);
    quitados.splice(quitados.indexOf(q), 1);
  }
  for (const q of quitados) partes.push(`${t.aud_removed} ${cita(q)}`);
  for (const a of anadidos) partes.push(`${t.aud_added} ${cita(a)}`);

  // El conteo solo cuando cambia: en una corrección de valor no dice nada.
  const conteo = antes.length !== despues.length ? ` (${antes.length} → ${despues.length})` : '';
  return `${etiqueta}: ${partes.join(' · ')}${conteo}`;
};

/** `update` no dice qué se editó: hay que mirar el payload para saberlo. */
const editado = (a: Fila, t: Voz): string => {
  const partes = [
    diffGastos(t.expenses, gastosDe(a.before, 'gastosTecnico'), gastosDe(a.after, 'gastosTecnico'), t),
    diffGastos(t.advances, gastosDe(a.before, 'anticiposCliente'), gastosDe(a.after, 'anticiposCliente'), t),
  ].filter(Boolean);
  if (partes.length) return partes.join(' · ');
  if (campo(a.before, 'roleTypeId') !== undefined || campo(a.after, 'roleTypeId') !== undefined)
    return t.aud_role;
  return t.aud_update;
};

/**
 * Qué pasó, en una frase.
 *
 * El verbo ya cuenta la transición de estado, así que `status: submitted → approved`
 * no se pinta: era el mismo hecho escrito tres veces. El motivo lo pone la pantalla al
 * lado, que es donde se lee, y no en una columna propia vacía en las demás filas.
 */
export const describir = (a: Fila, t: Voz): string => {
  if (a.entity === 'technician')
    return a.action === 'deactivate' || campo(a.after, 'isActive') === false
      ? t.aud_deactivate
      : t.aud_reactivate;

  switch (a.action) {
    case 'submit':
      return t.aud_submit;
    case 'approve':
      return t.aud_approve;
    case 'return':
      return t.aud_return;
    case 'reopen':
      return t.aud_reopen;
    case 'sign': {
      // La versión sí, el sha256 no: son 64 caracteres que nadie compara a ojo y que
      // siguen enteros en el registro original, que es donde valen como prueba.
      const v = campo(a.after, 'version');
      return v === undefined || v === null ? t.aud_sign : `${t.aud_sign} · v${String(v)}`;
    }
    case 'update':
      return editado(a, t);
    default:
      // Una acción nueva se ve tal cual antes que desaparecer del visor.
      return a.action;
  }
};
