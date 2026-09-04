import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiState, ConceptCode as ConceptChip, Empty, nf } from '../ui';
import { CONCEPTS } from '../i18n';
import { svg, ICON } from '../icons';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { getMisKpis } from '../lib/api/misKpis';
import type { Dict } from '../i18n';
import type { MiMaquina, MiProyecto } from '../lib/api/misKpis';

/**
 * «Mi resumen» — lo que el técnico produjo, devuelto a él.
 *
 * Hasta aquí el técnico registraba días y toda la inteligencia que generaba se la
 * quedaba el administrador. Esta pantalla cierra ese desequilibrio con la pregunta que
 * él sí se hace: cuántos días llevo en esta máquina, en qué obras he estado, cómo se
 * reparte mi año.
 *
 * LO QUE NO ESTÁ, y no por olvido: nada comercial (valor de contrato, vendido contra
 * ejecutado) y nada de otros técnicos. El servidor tampoco lo manda — ver
 * `mis-kpis.service.ts`. Tampoco la utilización: es la única cifra de la familia que se
 * lee como un juicio sobre la persona, y para «cuántos días llevo aquí» no hace falta.
 * El reparto por concepto dice lo mismo sin invitar a compararse con nadie.
 *
 * Móvil primero, que es donde está el técnico: tarjetas apiladas y no una tabla de
 * cinco columnas, que a 390px no se lee.
 */

/** La barra de proporción de una fila. El ancho es un dato, así que va en `style`. */
function Barra({ days, max }: { days: number; max: number }) {
  return (
    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-1.5">
      <div
        className="h-full rounded-full bg-primary"
        style={{ width: `${max ? (days / max) * 100 : 0}%` }}
      />
    </div>
  );
}

export default function MyStats() {
  const { state, t, patch } = useApp();
  /** `null` = todo su histórico. Arranca en el año en curso, que es lo que se mira. */
  const [anio, setAnio] = useState<number | null>(new Date().getFullYear());

  const { data, error } = useApiData(() => getMisKpis(anio), [anio, state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  /**
   * Sin jornadas en el año elegido puede ser que el técnico sea nuevo, o que esté
   * mirando un año en el que no trabajó. Si tiene otros años se le dice, en vez de
   * dejarle un vacío que parece la aplicación rota.
   */
  if (!data.totalDays) {
    return (
      <div className="max-w-[820px] mx-auto flex flex-col gap-4">
        {data.years.length ? <Anios data={data} anio={anio} setAnio={setAnio} t={t} /> : null}
        <Empty
          icon={svg(ICON.chart, { w: 30 })}
          msg={data.years.length ? t.mine_empty_year : t.mine_empty}
          btn={t.btn_logday}
          onClick={() => patch({ logOpen: true })}
        />
      </div>
    );
  }

  const maxMaq = data.machines[0]?.days ?? 0;
  const maxProy = data.projects[0]?.days ?? 0;

  /** Una cifra del encabezado. Sin color: aquí ninguna es mejor ni peor que otra. */
  const tarjeta = (label: string, valor: string) => (
    <Card>
      <CardContent>
        <div className="text-[11.5px] text-muted-foreground font-semibold uppercase tracking-wide">
          {label}
        </div>
        <div className="text-[27px] font-bold font-cond mt-1 leading-tight">{valor}</div>
      </CardContent>
    </Card>
  );

  const filaMaquina = (m: MiMaquina) => (
    <div key={m.orderId} className="px-4 py-3 border-t border-border first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold truncate">
            {m.label}
            {/* La commessa es como se nombra la máquina en obra: es lo que distingue
                dos PL 6000 del mismo proyecto. */}
            {m.commessaShort ? (
              <span className="ml-2 font-mono text-[11.5px] text-primary">{m.commessaShort}</span>
            ) : null}
          </div>
          <div className="text-[11.5px] text-muted-foreground truncate">{m.projectName}</div>
        </div>
        <div className="shrink-0 font-mono font-bold text-[15px] tabular-nums">
          {nf(m.days)} <span className="text-[11.5px] font-normal text-muted-foreground">{t.days_unit}</span>
        </div>
      </div>
      <Barra days={m.days} max={maxMaq} />
    </div>
  );

  const filaProyecto = (p: MiProyecto) => (
    <div key={p.projectId} className="px-4 py-3 border-t border-border first:border-t-0">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold truncate">{p.name}</div>
          <div className="text-[11.5px] text-muted-foreground truncate">{p.clientName}</div>
        </div>
        <div className="shrink-0 font-mono font-bold text-[15px] tabular-nums">
          {nf(p.days)} <span className="text-[11.5px] font-normal text-muted-foreground">{t.days_unit}</span>
        </div>
      </div>
      {/* El periodo responde «¿cuánto llevo en esta obra?», que es media pregunta que
          hoy no se puede contestar sin abrir el Excel. */}
      <div className="text-[11px] text-muted-foreground font-mono mt-0.5">
        {p.firstDate} → {p.lastDate}
      </div>
      <Barra days={p.days} max={maxProy} />
    </div>
  );

  return (
    <div className="max-w-[820px] mx-auto flex flex-col gap-4">
      <Anios data={data} anio={anio} setAnio={setAnio} t={t} />

      <div className="grid gap-3.5" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(148px,1fr))' }}>
        {tarjeta(t.mine_days, nf(data.totalDays))}
        {tarjeta(t.mine_projects, nf(data.projectCount))}
        {tarjeta(t.mine_machines, nf(data.machineCount))}
        {tarjeta(t.mine_notes_ok, nf(data.notes.approved))}
      </div>

      {/* Las devueltas, sólo si las hay: es lo único de esta pantalla sobre lo que el
          técnico tiene que hacer algo, así que se dice arriba y no en una lista. */}
      {data.notes.returned ? (
        <div className="flex gap-2.5 bg-warn-tint border border-warn rounded-card px-3.5 py-3">
          <div className="text-warn shrink-0">{svg(ICON.triangle, { w: 17 })}</div>
          <div className="text-[12.5px]">
            <span className="font-bold text-warn">
              {t.mine_returned.replace('{n}', String(data.notes.returned))}
            </span>
          </div>
        </div>
      ) : null}

      {data.machines.length ? (
        <Card className="p-0 gap-0 overflow-hidden">
          <CardHeader className="border-b p-4">
            <CardTitle>{t.mine_by_machine}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">{data.machines.map(filaMaquina)}</CardContent>
        </Card>
      ) : null}

      {data.projects.length ? (
        <Card className="p-0 gap-0 overflow-hidden">
          <CardHeader className="border-b p-4">
            <CardTitle>{t.mine_by_project}</CardTitle>
          </CardHeader>
          <CardContent className="p-0">{data.projects.map(filaProyecto)}</CardContent>
        </Card>
      ) : null}

      <Card className="p-0 gap-0 overflow-hidden">
        <CardHeader className="border-b p-4">
          <CardTitle>{t.mine_by_concept}</CardTitle>
        </CardHeader>
        <CardContent className="p-3 flex flex-col gap-1.5">
          {/* La mezcla, de un vistazo (diseno 2a). La lista de abajo da el numero
              exacto; esta barra da la PROPORCION, que es lo que se pregunta uno al
              mirar su ano: cuanto fue obra y cuanto viaje. Sin ella hay que comparar
              nueve cifras a ojo. */}
          <div className="flex h-3.5 rounded-md overflow-hidden mb-2" role="presentation">
            {data.concepts.map((c) => {
              const cc = CONCEPTS.find((x) => x.c === c.code);
              // Ancho y color son datos (porcentaje calculado, color del catalogo):
              // ninguno de los dos puede ser una clase de Tailwind.
              return (
                <div
                  key={c.code}
                  title={`${c.code} · ${nf(c.days)}`}
                  style={{
                    width: `${(c.days / data.totalDays) * 100}%`,
                    background: cc?.color ?? 'var(--steel)',
                  }}
                />
              );
            })}
          </div>
          {data.concepts.map((c) => (
            <div key={c.code} className="flex items-center gap-2.5 px-1 py-1.5">
              <ConceptChip code={c.code} />
              <span className="flex-1 min-w-0 text-[12.5px] text-muted-foreground truncate">
                {state.lang === 'it' ? c.labelIt : c.labelEs}
              </span>
              <span className="font-mono font-semibold text-[13px] tabular-nums shrink-0">
                {nf(c.days)}
              </span>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

/**
 * El selector de año. Pastillas y no un desplegable: son pocos años y el activo se ve
 * de un vistazo — el mismo lenguaje que `FiltroVigencia` y los filtros de la bandeja.
 *
 * Es el ÚNICO filtro de la pantalla a propósito. El administrador necesita filtros
 * porque mira 443 notas de 16 personas; el técnico mira las suyas, y cada control de
 * más es una razón para no abrir la aplicación.
 */
function Anios({
  data, anio, setAnio, t,
}: {
  data: { years: number[] };
  anio: number | null;
  setAnio: (v: number | null) => void;
  t: Dict;
}) {
  if (!data.years.length) return null;
  return (
    <div className="flex gap-2 flex-wrap">
      {data.years.map((a) => (
        <Button
          key={a}
          variant={anio === a ? 'default' : 'outline'}
          size="sm"
          onClick={() => setAnio(a)}
          className="min-h-11 md:min-h-8"
        >
          {a}
        </Button>
      ))}
      <Button
        variant={anio === null ? 'default' : 'outline'}
        size="sm"
        onClick={() => setAnio(null)}
        className="min-h-11 md:min-h-8"
      >
        {t.grid_all_years}
      </Button>
    </div>
  );
}
