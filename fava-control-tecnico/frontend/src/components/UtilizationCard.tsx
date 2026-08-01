import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ApiState } from '../ui';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { getUtilization } from '../lib/api/kpis';
import type { UtilizationRow } from '../lib/api/kpis';

/**
 * KPI-02 — utilización por técnico, contra el API real.
 *
 * El número solo vale si se sabe cómo está hecho, así que la pantalla IMPRIME la regla
 * que le manda el servidor en vez de que cada lector suponga la suya. Dos decisiones que
 * se ven aquí y que no son cosméticas:
 *
 *  - La barra compara con el denominador de CADA técnico, y el denominador se muestra al
 *    lado. No todos tienen el mismo tramo registrado (el histórico de algunos se corta en
 *    junio) y un 89 % sobre 164 días no dice lo mismo que un 57 % sobre 213.
 *  - Sin días disponibles no se pinta «0 %» sino un guion: un técnico de baja todo el
 *    periodo no tiene una utilización del cero, no tiene utilización.
 */

/** Verde / ámbar / rojo por tramos. Es semáforo de lectura, no un umbral de negocio. */
function color(pct: number | null): string {
  if (pct === null) return 'bg-muted';
  if (pct >= 70) return 'bg-ok';
  if (pct >= 45) return 'bg-accent-brand';
  return 'bg-warn';
}

function Fila({ t }: { t: UtilizationRow }) {
  const pct = t.utilizationPct;
  return (
    <TableRow>
      <TableCell className="font-medium">
        {t.technicianName}
        {t.technicianActive ? null : (
          <span className="ml-2 text-[11px] text-muted-foreground">(inactivo)</span>
        )}
      </TableCell>
      <TableCell className="w-[45%]">
        <div className="flex items-center gap-2.5">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            {/* El ancho es un porcentaje calculado: no hay clase de Tailwind por cada
                valor posible, así que va en `style` a propósito. */}
            <div className={`h-full rounded-full ${color(pct)}`} style={{ width: `${pct ?? 0}%` }} />
          </div>
          <span className="text-[13px] font-semibold font-mono w-14 text-right">
            {pct === null ? '—' : `${pct}%`}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right font-mono text-[13px]">{t.productive}</TableCell>
      <TableCell className="text-right font-mono text-[13px] text-muted-foreground">
        {t.denominator}
      </TableCell>
      <TableCell className="text-right font-mono text-[13px] text-muted-foreground">
        {t.excluded || ''}
      </TableCell>
    </TableRow>
  );
}

export default function UtilizationCard({ year }: { year: number | null }) {
  const { state, t } = useApp();
  // `dataVersion` en las deps, igual que la cuadrícula: sin él, aprobar una nota no
  // repintaba esta tarjeta y el admin veía la utilización de antes de su propia
  // aprobación hasta recargar la página.
  const { data, error } = useApiData(() => getUtilization(year), [year, state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  return (
    <Card>
      <CardHeader className="flex-row items-baseline justify-between gap-3 flex-wrap">
        <CardTitle>{t.util}</CardTitle>
        <div className="text-[13px] text-muted-foreground">
          {t.k_util_avg}:{' '}
          <span className="font-mono font-bold text-foreground">
            {data.utilizationPct === null ? '—' : `${data.utilizationPct}%`}
          </span>{' '}
          <span className="font-mono">
            ({data.productive}/{data.denominator} {t.days_unit})
          </span>
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.col_tech}</TableHead>
                <TableHead>{t.k_util_avg}</TableHead>
                <TableHead className="text-right">{t.util_productive}</TableHead>
                <TableHead className="text-right">{t.util_available}</TableHead>
                <TableHead className="text-right">{t.util_excluded}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.technicians.map((x) => (
                <Fila key={x.technicianId} t={x} />
              ))}
            </TableBody>
          </Table>
        </div>

        {/* La regla, dicha en la pantalla. Sin esto el porcentaje es un número suelto
            que cada quien interpreta como quiere — y es el reproche clásico a un KPI
            de utilización. */}
        <div className="mt-3.5 text-[11.5px] text-muted-foreground leading-relaxed">
          <div>
            {t.util_rule_prod}: <span className="font-mono">{data.rule.productive.join(' · ')}</span>
            {' — '}
            {t.util_rule_nonprod}: <span className="font-mono">{data.rule.nonProductive.join(' · ')}</span>
            {' — '}
            {t.util_rule_excl}: <span className="font-mono">{data.rule.excluded.join(' · ')}</span>
          </div>
          {data.futureExcluded > 0 ? (
            <div className="mt-1">
              {t.util_future.replace('{n}', String(data.futureExcluded))}
            </div>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
