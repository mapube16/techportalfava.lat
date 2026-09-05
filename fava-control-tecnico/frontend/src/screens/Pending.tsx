import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { ApiState, Card } from '../ui';
import { svg, ICON, hi } from '../icons';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { getPendientes } from '../lib/api/pendientes';
import { listNotes } from '../lib/api/weeklyNotes';
import { hoyLocal, lunesDe, semanaIso } from '../lib/fecha';
import type { WeeklyNote } from '../lib/api/weeklyNotes';

/**
 * Pendientes — la pantalla de entrada del técnico (diseño 3b).
 *
 * «Lo primero al entrar no es un menú: es la lista de lo que le falta.» Cuatro cosas
 * pueden faltarle, y salen en este orden porque es el de urgencia:
 *
 *   1. Una nota DEVUELTA, con el motivo de Andrea — corregir el día y reenviar (NOTA-03).
 *   2. Una nota enviada SIN FIRMAR — sin firma no se aprueba (nota-04).
 *   3. El CORTE DEL 25, si está encima y hay semanas sin enviar. Felipe preguntó en la
 *      capacitación del 31-ago si tenía que enviar cada semana; Andrea aceptó que
 *      acumule «pero al corte del 25 tiene que estar lleno».
 *   4. Cada SEMANA SIN ENVIAR de la ventana editable, con cuántos días lleva.
 *
 * Y siempre, al final, la semana en curso con su avance: no es un pendiente, es donde
 * se trabaja hoy, y desde aquí se abre el cajón sin pasar por otra pantalla.
 *
 * NO es el «Inicio» que se quitó en `d2f1a2d`: aquel duplicaba «Mis notas» y tenía un
 * contador roto. Esta lista no repite ninguna otra pantalla: cada tarjeta lleva a la
 * pantalla donde se resuelve (la semana, o la nota a firmar).
 *
 * UNA TARJETA POR SEMANA, NO POR NOTA. Una semana en dos proyectos produce DOS notas
 * (NOTA-01: una por proyecto, porque son dos clientes y dos firmas). Pintadas como dos
 * tarjetas parecían trabajo duplicado — «¿por qué me piden firmar dos veces la semana
 * 36?». Agrupadas por semana, la tarjeta dice «2 notas, una por proyecto» y nombra los
 * proyectos: se entiende de un vistazo que es la misma semana partida en dos.
 */

/** Las notas de una misma semana, para pintarlas como UNA tarjeta. */
const porSemana = (notas: WeeklyNote[]) => {
  const m = new Map<string, WeeklyNote[]>();
  for (const n of notas) {
    const k = n.weekStart.slice(0, 10);
    m.set(k, [...(m.get(k) ?? []), n]);
  }
  return [...m.entries()].sort(([a], [b]) => (a < b ? 1 : -1));
};

type Tono = 'warn' | 'sent' | 'draft' | 'primary';

interface Item {
  key: string;
  icon: ReactNode;
  tono: Tono;
  title: string;
  body: string;
  cta: string;
  onClick: () => void;
}

/** Fondo del icono y color del CTA. Tailwind no compone clases en runtime: van enteras. */
const TONO: Record<Tono, { caja: string; texto: string }> = {
  warn: { caja: 'bg-warn-tint text-warn', texto: 'text-warn' },
  sent: { caja: 'bg-sent-tint text-sent', texto: 'text-sent' },
  draft: { caja: 'bg-draft-tint text-draft', texto: 'text-draft' },
  primary: { caja: 'bg-primary-tint text-primary', texto: 'text-primary' },
};

function Tarjeta({ it }: { it: Item }) {
  const c = TONO[it.tono];
  return (
    <Card>
      <button
        type="button"
        onClick={it.onClick}
        className="w-full text-left p-3.5 flex gap-3 cursor-pointer rounded-card hover:bg-muted/50 transition-colors min-h-11"
      >
        <span className={`size-[34px] shrink-0 rounded-[9px] grid place-items-center ${c.caja}`}>
          {it.icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-bold">{it.title}</div>
          {it.body ? (
            <div className="text-[11.5px] text-muted-foreground leading-relaxed mt-0.5">{it.body}</div>
          ) : null}
          <div className={`text-[11.5px] font-bold mt-2 ${c.texto}`}>{it.cta} →</div>
        </div>
      </button>
    </Card>
  );
}

export default function Pending() {
  const { state, t, go, patch } = useApp();
  const miTecnico = state.me?.status === 'ok' ? state.me.user.technicianId : null;

  const { data: pend, error } = useApiData(getPendientes, [state.dataVersion]);
  const { data: notas } = useApiData(
    () => (miTecnico ? listNotes(undefined, miTecnico) : Promise.resolve([])),
    [miTecnico, state.dataVersion],
  );

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!pend || !notas) return <ApiState error={null} label={t.loading} />;

  const hoy = hoyLocal();
  const lunesHoy = lunesDe(hoy);
  const num = (lunes: string) => String(semanaIso(lunes).semana);
  const avance = (n: number) => t.week_progress.replace('{n}', String(n)).replace('{d}', '7');

  // Cada tarjeta lleva a DONDE se resuelve, con la semana o la nota ya abierta: sin esto
  // el técnico aterrizaba en «Mi semana» de hoy y tenía que navegar hasta la buena.
  const abrirSemana = (lunes: string) => {
    patch({ weekStart: lunes });
    go('week');
  };
  const abrirNota = (id: string) => {
    patch({ noteFocus: id });
    go('notes');
  };

  const items: Item[] = [];

  /** «2 notas, una por proyecto» cuando la semana se partió; si es una, solo el proyecto. */
  const cuantas = (ns: WeeklyNote[]) =>
    ns.length > 1 ? `${t.pd_per_project.replace('{n}', String(ns.length))} · ` : '';

  for (const [lunes, ns] of porSemana(notas.filter((x) => x.status === 'returned'))) {
    items.push({
      key: `ret-${lunes}`,
      icon: hi('ureturn', { w: 18 }),
      tono: 'warn',
      title: `${t.st_returned} · ${t.notes_week.replace('{n}', num(lunes))}`,
      // El motivo de cada una, con su proyecto delante cuando hay más de una.
      body:
        cuantas(ns) +
        ns.map((n) => (ns.length > 1 ? `${n.projectName}: ` : '') + (n.returnComment ?? '')).join(' · '),
      cta: t.pd_fix,
      onClick: () => abrirSemana(lunes),
    });
  }

  for (const [lunes, ns] of porSemana(notas.filter((x) => x.status === 'submitted' && !x.signed))) {
    items.push({
      key: `sig-${lunes}`,
      icon: hi('pencil', { w: 18 }),
      tono: 'sent',
      title: `${t.btn_signnote} · ${t.notes_week.replace('{n}', num(lunes))}`,
      body: cuantas(ns) + ns.map((n) => `${n.projectName} (${n.clientName})`).join(' · '),
      cta: t.btn_signnote,
      // Abre la primera; al firmarla, la siguiente sigue en la cola de «Mis notas».
      onClick: () => abrirNota(ns[0].id),
    });
  }

  /**
   * Sin enviar = hay borradores, o no hay nada. Es el criterio del recordatorio del
   * viernes (`recordatorios.ts`), no uno propio. Solo semanas YA pasadas: la de hoy no
   * está «sin enviar», está en curso.
   */
  const sinEnviar = pend.semanas.filter(
    (s) => s.lunes < lunesHoy && (s.borradores > 0 || s.registrados === 0),
  );

  // El corte solo se anuncia mientras se puede llegar: pasado el 25, ese mes ya cerró.
  if (Number(hoy.slice(8, 10)) <= pend.diaCorte && sinEnviar.length) {
    items.push({
      key: 'corte',
      icon: svg(ICON.triangle, { w: 18 }),
      tono: 'warn',
      title: t.pd_cutoff.replace('{d}', String(pend.diaCorte)),
      body: t.pd_cutoff_body
        .replace('{n}', String(sinEnviar.length))
        .replace('{d}', String(pend.diaCorte)),
      cta: t.pd_open_week,
      onClick: () => abrirSemana(sinEnviar[0].lunes),
    });
  }

  for (const s of sinEnviar) {
    items.push({
      key: `w-${s.lunes}`,
      icon: svg(ICON.cal, { w: 18 }),
      tono: 'draft',
      title: t.pd_week_unsent.replace('{n}', num(s.lunes)),
      body: avance(s.registrados),
      cta: t.pd_open_week,
      onClick: () => abrirSemana(s.lunes),
    });
  }

  const actual = pend.semanas.find((s) => s.lunes === lunesHoy);

  return (
    <div className="max-w-[640px] mx-auto flex flex-col gap-2.5">
      <div className="flex items-center justify-between px-0.5 mb-1">
        <div className="text-[19px] font-bold font-cond">{t.pd_title}</div>
        <div className="relative flex text-muted-foreground" aria-label={`${items.length}`}>
          {svg(ICON.bell, { w: 20 })}
          {items.length ? (
            <span className="absolute -top-1 -right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-accent-brand text-white text-[9.5px] font-bold grid place-items-center">
              {items.length}
            </span>
          ) : null}
        </div>
      </div>

      {items.length === 0 ? (
        <div className="text-[12.5px] font-semibold text-ok px-0.5">{t.pd_all_clear}</div>
      ) : null}

      {items.map((it) => (
        <Tarjeta key={it.key} it={it} />
      ))}

      {actual ? (
        <Tarjeta
          it={{
            key: 'actual',
            icon: svg(ICON.cal, { w: 18 }),
            tono: 'primary',
            title: t.pd_current.replace('{n}', num(actual.lunes)),
            body: avance(actual.registrados),
            cta: t.pd_log_today,
            onClick: () => patch({ logOpen: true, logDate: hoy }),
          }}
        />
      ) : null}

      <Button variant="outline" onClick={() => go('notes')} className="min-h-11 mt-1">
        {t.pd_all_notes} →
      </Button>
    </div>
  );
}
