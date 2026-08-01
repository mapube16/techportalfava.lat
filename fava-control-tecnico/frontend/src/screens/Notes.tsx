import { svg, ICON, hi } from '../icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ApiState, Empty, StatusPill } from '../ui';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { listNotes } from '../lib/api/weeklyNotes';

/**
 * Las notas del TECNICO. No las crea ni las elige (NOTA-01): salen solas al enviar la
 * semana, una por proyecto. Aqui solo las mira y, si se la devolvieron, lee el porque.
 *
 * No hace falta filtrar por tecnico: la politica `wn_read` de RLS ya lo hace en el
 * motor. Un filtro aqui seria una segunda verdad que puede desincronizarse.
 */
export default function Notes() {
  const { state, t, go, patch } = useApp();
  const { data, error } = useApiData(() => listNotes(), [state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  if (!data.length) {
    return (
      <Empty
        icon={svg(ICON.doc, { w: 30 })}
        msg={t.empty_notes}
        btn={t.btn_logday}
        onClick={() => patch({ logOpen: true })}
      />
    );
  }

  return (
    <div className="max-w-[820px] mx-auto flex flex-col gap-3">
      {data.map((n) => (
        <Card key={n.id}>
          <CardContent className="p-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[200px]">
                <div className="text-[14.5px] font-bold">{n.projectName}</div>
                <div className="text-[12.5px] text-muted-foreground font-mono">
                  {n.weekStart}
                  {n.roleTypeName ? ` · ${n.roleTypeName}` : ''}
                </div>
              </div>
              <StatusPill st={n.status as never} t={t} />
              {/* «Reenviar» NO es un botón propio: se corrige el día en la semana y se
                  vuelve a enviar desde allí. Un botón aquí sugeriría que la nota se
                  puede reenviar sin tocar lo que la hizo volver. */}
              <Button variant="outline" onClick={() => go('week')} className="min-h-11 md:min-h-9">
                {t.btn_open}
              </Button>
            </div>
            {n.returnComment ? (
              <div className="mt-3 flex gap-2.5 bg-warn-tint border border-warn rounded-lg px-3 py-2.5">
                <div className="text-warn shrink-0">{svg(ICON.triangle, { w: 17 })}</div>
                <div>
                  <div className="text-xs font-bold text-warn">{t.returned_note}</div>
                  <div className="text-[12.5px] text-muted-foreground mt-0.5">{n.returnComment}</div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
