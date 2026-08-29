import { useState } from 'react';
import { hi } from '../icons';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ApiState, ConceptPill, StatusPill, filterBy, mesCorto } from '../ui';
import { useApp } from '../state';
import ReceiptsBlock from '../components/ReceiptsBlock';
import { useIsMobile } from '../lib/useIsMobile';
import { codigo, useApiData } from '../lib/api/useApiData';
import { approveNote, listNotes, noteDays } from '../lib/api/weeklyNotes';
import type { NoteStatus, WeeklyNote } from '../lib/api/weeklyNotes';
import { diasDeSemana } from '../lib/fecha';
import type { Lang } from '../types';

/**
 * La bandeja del admin: las notas enviadas, con los 7 días de cada una para poder
 * decidir sin salir de aquí.
 *
 * En móvil es UNA columna con navegación: la lista, y al elegir, el detalle con botón
 * de volver. El maestro/detalle lado a lado se desbordaba a 390px — era el pendiente
 * que quedó abierto de la auditoría de UX.
 */

/** Iniciales del nombre, para el avatar. Dos como mucho. */
const iniciales = (nombre: string) =>
  nombre
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');

/** «Todos». Centinela porque `SelectItem` de Radix no admite valor vacío. */
const TODOS = '*';

/** Un desplegable de filtro. Los tres son el mismo, así que se escribe una vez. */
function Filtro({
  valor, set, todos, ops,
}: {
  valor: string;
  set: (v: string) => void;
  todos: string;
  ops: { v: string; label: string }[];
}) {
  return (
    <Select value={valor} onValueChange={set}>
      <SelectTrigger className="min-h-11 md:min-h-8 text-[12.5px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={TODOS}>{todos}</SelectItem>
        {ops.map((o) => (
          <SelectItem key={o.v} value={o.v}>{o.label}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** El punto de color de la lista. Escritas enteras: Tailwind no compone `bg-${x}`. */
const PUNTO: Record<NoteStatus, string> = {
  draft: 'bg-draft', submitted: 'bg-sent', approved: 'bg-ok', returned: 'bg-warn',
};

/** Los 7 días de la nota. Se piden aparte: es lo que el admin lee para decidir. */
function Dias({ nota, lang, dias }: { nota: WeeklyNote; lang: Lang; dias: string[] }) {
  const { t } = useApp();
  const { data } = useApiData(() => noteDays(nota.id), [nota.id]);
  const porFecha = new Map((data ?? []).map((e) => [e.date, e]));
  // Días registrados pero SIN una sola descripción: es el histórico del Excel, que no
  // tiene esa columna. Sin decirlo, el hueco se lee como si la app hubiera perdido algo.
  const sinTexto = !!data?.length && data.every((e) => !e.description);

  return (
    <div className="px-4.5 py-2">
      {dias.map((fecha, i) => {
        const e = porFecha.get(fecha);
        return (
          <div key={fecha} className={`flex gap-3 py-2.5 items-start ${i ? 'border-t border-border' : ''}`}>
            <div className="w-9.5 text-[11px] text-muted-foreground font-semibold shrink-0">
              {t.days[i]} {Number(fecha.slice(8, 10))}
            </div>
            <div className="w-[140px] shrink-0">
              {e?.conceptCode ? <ConceptPill code={e.conceptCode} lang={lang} /> : null}
            </div>
            <div className="flex-1 text-[12.5px] text-muted-foreground leading-relaxed min-w-0">
              {e?.description ?? ''}
              {e?.machine ? <span className="text-ink-2">{e.machine}</span> : null}
              {e?.commessaShort ? (
                <span className="ml-2 font-mono text-[11px] text-primary">{e.commessaShort}</span>
              ) : null}
              {e?.inFactory ? (
                <span className="ml-2 text-[11px] text-muted-foreground">· {t.log_in_factory}</span>
              ) : null}
            </div>
          </div>
        );
      })}
      {sinTexto ? (
        <div className="border-t border-border pt-2.5 pb-1 text-[11.5px] text-muted-foreground">
          {t.hist_no_desc}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Dos pantallas, un componente. La lista, el detalle de los siete días y el visor de
 * PDF son idénticos; lo único que cambia es para qué se abre cada una.
 *
 * - `archivo = false` — LA COLA. Solo `submitted`: lo que hay que decidir hoy. Sin
 *   filtros a propósito, porque una cola con filtros deja de ser una cola.
 * - `archivo = true` — EL ARCHIVO. Todas las notas de todos los técnicos, con filtro
 *   por estado y sin botones de aprobar ni devolver: se consulta, no se decide.
 *
 * No se llama «histórico» aunque hoy solo tenga las 443 migradas: en cuanto Andrea
 * apruebe la primera nota real, esa nota también vive aquí.
 */
export default function Inbox({ archivo = false }: { archivo?: boolean }) {
  const { state, t, patch, showToast, refresh } = useApp();
  const movil = useIsMobile();
  const [selNote, setSelNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [estado, setEstado] = useState<NoteStatus | 'all'>('all');
  // Año, mes y técnico. `TODOS` es un centinela porque `SelectItem` de Radix no admite
  // valor vacío — el mismo truco que ya usa el selector de año de la cuadrícula.
  const [anio, setAnio] = useState(TODOS);
  const [mes, setMes] = useState(TODOS);
  const [tec, setTec] = useState(TODOS);

  const filtrar = archivo ? estado : 'submitted';
  const { data, error } = useApiData(
    () => listNotes(filtrar === 'all' ? undefined : filtrar),
    [state.dataVersion, filtrar],
  );
  const filtros: { k: NoteStatus | 'all'; label: string }[] = [
    { k: 'all', label: t.st_all },
    { k: 'approved', label: t.st_approved },
    { k: 'submitted', label: t.st_sent },
    { k: 'returned', label: t.st_returned },
  ];

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  /**
   * Los tres filtros se resuelven en el cliente y no en el servidor a propósito: las
   * notas de la pantalla ya están todas descargadas (443 hoy, ~1.500 al año) y filtrar
   * un array es instantáneo. Un parámetro más en el endpoint solo tendría sentido el
   * día que esto haya que paginar.
   *
   * Las opciones salen de lo que HAY, no de un rango inventado: si nadie trabajó en
   * agosto, agosto no aparece.
   */
  const anios = [...new Set(data.map((n) => n.weekStart.slice(0, 4)))].sort().reverse();
  const meses = [...new Set(data.map((n) => n.weekStart.slice(5, 7)))].sort();
  const tecnicos = [...new Set(data.map((n) => n.technicianName))].sort((a, b) => a.localeCompare(b));

  const enFiltro = data.filter(
    (n) =>
      (anio === TODOS || n.weekStart.slice(0, 4) === anio) &&
      (mes === TODOS || n.weekStart.slice(5, 7) === mes) &&
      (tec === TODOS || n.technicianName === tec),
  );

  const q = filterBy(archivo ? enFiltro : data, state.search, (n) => `${n.technicianName} ${n.projectName}`);
  // En escritorio se preselecciona la primera; en móvil no, porque la lista ES la vista.
  const cur = q.find((n) => n.id === selNote) ?? (movil ? null : q[0]);

  const aprobar = (n: WeeklyNote) => {
    setErr(null);
    // `updatedAt` es lo que compara el servidor: si otro admin ya la movió, 409 en vez
    // de pisar su decisión en silencio.
    approveNote(n.id, n.updatedAt)
      .then(() => {
        setSelNote(null);
        refresh();
        showToast('saved');
      })
      .catch((e: unknown) => setErr(codigo(e)));
  };

  const lista = (
    <div className={`${movil ? 'w-full' : 'w-[340px]'} shrink-0 flex flex-col gap-2.5`}>
      {archivo ? (
        <>
          <div className="flex flex-wrap gap-1.5">
            {filtros.map((f) => (
              <Button
                key={f.k}
                variant={estado === f.k ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setEstado(f.k); setSelNote(null); }}
                className="min-h-11 md:min-h-8"
              >
                {f.label}
              </Button>
            ))}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <Filtro valor={anio} set={setAnio} todos={t.grid_all_years}
              ops={anios.map((a) => ({ v: a, label: a }))} />
            <Filtro valor={mes} set={setMes} todos={t.all_months}
              ops={meses.map((m) => ({ v: m, label: mesCorto(Number(m), state.lang) }))} />
            <Filtro valor={tec} set={setTec} todos={t.all_techs}
              ops={tecnicos.map((n) => ({ v: n, label: n }))} />
          </div>

          <div className="text-[11.5px] text-muted-foreground px-0.5">
            {q.length} / {data.length}
          </div>
        </>
      ) : null}
      {q.length ? (
        q.map((n) => {
          const sel = !movil && cur?.id === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setSelNote(n.id)}
              className={`text-left rounded-card shadow-card px-3.5 py-3 min-h-11 cursor-pointer flex gap-2.5 items-center border transition-colors ${
                sel ? 'bg-primary-tint border-primary' : 'bg-card border-border hover:bg-muted'
              }`}
            >
              <div className="size-8.5 rounded-full bg-primary-700 text-white grid place-items-center text-xs font-bold shrink-0">
                {iniciales(n.technicianName)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13.5px] font-semibold">{n.technicianName}</div>
                <div className="text-xs text-muted-foreground truncate">{n.projectName}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5 font-mono">{n.weekStart}</div>
              </div>
              <span className={`size-2 rounded-full shrink-0 ${PUNTO[n.status]}`} />
            </button>
          );
        })
      ) : (
        <div className="p-7.5 text-center text-muted-foreground text-[13px] border border-dashed border-input rounded-card">
          {/* «Todas las notas están al día» es el vacío de una COLA. En el archivo esa
              frase mentiría: ahí un vacío solo dice que no hay registros. */}
          <span className="inline-flex gap-1.5 items-center justify-center">
            {archivo ? null : hi('check', { w: 15 })}
            {archivo ? t.empty_list : t.inbox_empty}
          </span>
        </div>
      )}
    </div>
  );

  const detalle = cur ? (
    <Card className="p-0 gap-0 overflow-hidden">
      <div className="flex items-center gap-3 px-4.5 py-4 border-b border-border flex-wrap">
        {movil ? (
          <Button variant="outline" size="icon" onClick={() => setSelNote(null)} aria-label={t.pdf_close} className="size-11 md:size-9">
            ←
          </Button>
        ) : null}
        <div className="size-10 rounded-full bg-primary-700 text-white grid place-items-center font-bold shrink-0">
          {iniciales(cur.technicianName)}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[15px] font-bold">{cur.technicianName}</div>
          <div className="text-[12.5px] text-muted-foreground">
            {cur.projectName} · {cur.weekStart}
            {cur.roleTypeName ? ` · ${cur.roleTypeName}` : ''}
          </div>
        </div>
        <StatusPill st={cur.status} t={t} />
      </div>

      <Dias nota={cur} lang={state.lang} dias={diasDeSemana(cur.weekStart)} />

      {err ? (
        <div className="px-4.5 py-2.5 text-[12.5px] text-warn">{t.err_save}: {err}</div>
      ) : null}

      <div className="flex gap-2.5 px-4.5 py-3.5 border-t border-border justify-end flex-wrap">
        {/* El PDF, SIEMPRE. Es lo único que se puede hacer con una nota histórica, y
            para el admin es el papel de siempre: el servidor lo renderiza al vuelo con
            el mismo generador que congela los firmados, con las casillas de firma en
            blanco cuando no hay firma — que es la verdad de estas 443. */}
        <Button
          variant="outline"
          onClick={() => patch({ pdfOpen: true, pdfNoteId: cur.id, pdfSigned: cur.signed })}
          className="min-h-11 md:min-h-9 mr-auto"
        >
          {hi('eye', { w: 15 })}
          {t.btn_pdf}
        </Button>

        {/* Los comprobantes del gasto, para MIRARLOS antes de decidir: se aprueban con
            la semana y con el mismo boton, asi que tienen que estar aqui y no a un clic
            de distancia. En solo lectura — quien los sube es el tecnico. */}
        <div className="w-full">
          <ReceiptsBlock noteId={cur.id} soloLectura />
        </div>

        {/* Decidir es cosa de la cola. En el archivo no salen ni sobre una nota enviada:
            si Andrea quiere aprobarla, va a la Bandeja, que es donde se aprueba. */}
        {!archivo && cur.status === 'submitted' ? (
          <>
            <Button
              variant="destructive"
              onClick={() => patch({ returnOpen: true, returnId: cur.id, returnUpdatedAt: cur.updatedAt })}
              className="min-h-11 md:min-h-9"
            >
              {hi('ureturn', { w: 15 })}
              {t.btn_return}
            </Button>
            <Button onClick={() => aprobar(cur)} className="min-h-11 md:min-h-9 bg-ok text-white hover:bg-ok/90">
              {hi('check', { w: 16 })}
              {t.btn_approve}
            </Button>
          </>
        ) : null}
      </div>
    </Card>
  ) : (
    <Card>
      <div className="p-10 text-center text-muted-foreground">{archivo ? t.empty_list : t.inbox_empty}</div>
    </Card>
  );

  // En móvil una cosa u otra, nunca las dos: lado a lado no cabe en 390px.
  if (movil) return cur ? detalle : lista;

  return (
    <div className="flex gap-4.5 items-start">
      {lista}
      <div className="flex-1 min-w-0">{detalle}</div>
    </div>
  );
}
