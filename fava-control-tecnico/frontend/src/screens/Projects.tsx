import { useState } from 'react';
import { hi } from '../icons';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiState, FiltroVigencia, chip, filterBy, money, nf, porVigencia } from '../ui';
import type { Vigencia } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { codigo, useApiData } from '../lib/api/useApiData';
import { listProjects, setProjectActive } from '../lib/api/projects';
import type { ProjectListItem } from '../lib/api/projects';

/** El valor de contrato puede no estar cargado todavía: un 0 sería un dato falso. */
const valor = (p: ProjectListItem) =>
  p.contractValue == null ? '—' : money(p.contractValue, p.currencyCode ?? '');

export default function Projects() {
  const { state, t, go, patch, errTexto } = useApp();
  const movil = useIsMobile();
  const { data, setData, error } = useApiData(listProjects, [state.dataVersion]);
  const [errActivo, setErrActivo] = useState<string | null>(null);
  const [cambiando, setCambiando] = useState<string | null>(null);
  // Por defecto SOLO los activos: hoy son 5 de 23, y una lista con 18 filas apagadas
  // esconde las que importan. El recuento del filtro dice cuantas quedan fuera.
  const [vigencia, setVigencia] = useState<Vigencia>('activos');

  const addBtn = (
    <Button onClick={() => patch({ projOpen: true })} className="min-h-11 md:min-h-9">
      {hi('plus', { w: 15 })}
      {t.btn_newproj}
    </Button>
  );

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const rows = filterBy(porVigencia(data, vigencia), state.search, (p) =>
    [p.name, p.clientName, p.contractNumber, p.machineCodes.join(' '), p.country].join(' '));

  /**
   * CAT-01: dar de baja un proyecto — mismo patrón que en Técnicos.
   *
   * El endpoint y el cliente (`setProjectActive`) existían desde la Fase 2 y NINGUNA
   * pantalla los llamaba: los 18 proyectos inactivos de hoy hubo que apagarlos por
   * SQL. Desactivar no borra nada — deja de ofrecerse en formularios nuevos y sale
   * del filtro «Activos», y sus jornadas históricas siguen contando.
   */
  const conmutarActivo = (p: ProjectListItem) => {
    setErrActivo(null);
    setCambiando(p.id);
    setProjectActive(p.id, !p.isActive)
      .then((actualizado) =>
        setData(data.map((x) => (x.id === p.id ? { ...x, isActive: actualizado.isActive } : x))),
      )
      .catch((e: unknown) => setErrActivo(codigo(e)))
      .finally(() => setCambiando(null));
  };

  const openProject = (id: string) => {
    patch({ selProject: id });
    go('project');
  };

  if (movil) {
    const meta = (a: string, b: string) => (
      <div>
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide">{a}</div>
        <div className="text-[13px] font-semibold font-mono mt-0.5">{b}</div>
      </div>
    );
    return (
      <Card className="p-0 gap-0 overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between border-b p-4">
          <CardTitle>{t.t_projects}</CardTitle>
          {addBtn}
        </CardHeader>
        <CardContent className="p-3 flex flex-col gap-2.5">
        <FiltroVigencia valor={vigencia} onChange={setVigencia} items={data} t={t} />

          {rows.length ? (
            rows.map((p) => (
              <div
                key={p.id}
                onClick={() => openProject(p.id)}
                className={`border border-border rounded-card p-3.5 cursor-pointer ${p.isActive ? '' : 'opacity-55'}`}
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-bold">{p.name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{p.clientName} · {p.country}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cambiando === p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        conmutarActivo(p);
                      }}
                      className="min-h-11"
                    >
                      {p.isActive ? t.cat_deactivate : t.cat_activate}
                    </Button>
                    <span className="text-primary">→</span>
                  </div>
                </div>
                <div className="flex gap-4.5 mt-2.5 flex-wrap">
                  {meta(t.proj_contract_no, p.contractNumber)}
                  {meta(t.contract, valor(p))}
                  {meta(t.hours_short, nf(p.normalHours || 0) + ' h')}
                </div>
                <div className="flex gap-1 flex-wrap mt-2.5">
                  {p.machineCodes.map((m) => (
                    <span key={m} className={chip}>{m}</span>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <div className="p-6.5 text-center text-muted-foreground text-[13px]">
              {data.length ? t.filter_no : t.proj_none}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="p-0 gap-0 overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between border-b p-4">
        <CardTitle>{t.t_projects}</CardTitle>
        {addBtn}
      </CardHeader>
      <div className="px-4 py-3 border-b">
        <FiltroVigencia valor={vigencia} onChange={setVigencia} items={data} t={t} />
      </div>
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>{t.col_project}</TableHead>
              <TableHead>{t.client}</TableHead>
              <TableHead>{t.proj_contract_no}</TableHead>
              <TableHead>{t.proj_country}</TableHead>
              <TableHead>{t.contract}</TableHead>
              <TableHead className="text-right">{t.hours_short}</TableHead>
              <TableHead>{t.orders}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length ? (
              rows.map((p, i) => (
                <TableRow
                  key={p.id}
                  onClick={() => openProject(p.id)}
                  className={`cursor-pointer ${p.isActive ? '' : 'opacity-55'}`}
                >
                  <TableCell className="text-muted-foreground font-mono text-xs">{i + 1}</TableCell>
                  <TableCell className="font-semibold">{p.name}</TableCell>
                  <TableCell>{p.clientName}</TableCell>
                  <TableCell className="font-mono text-xs text-muted-foreground">{p.contractNumber}</TableCell>
                  <TableCell>{p.country}</TableCell>
                  <TableCell className="font-mono font-semibold">{valor(p)}</TableCell>
                  <TableCell className="font-mono font-semibold text-right">{nf(p.normalHours || 0)} h</TableCell>
                  <TableCell>
                    <div className="flex gap-1 flex-wrap">
                      {p.machineCodes.map((m) => (
                        <span key={m} className={chip}>{m}</span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {/* stopPropagation: la fila entera navega al detalle, y sin esto
                        desactivar te llevaría al proyecto que acabas de apagar. */}
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={cambiando === p.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        conmutarActivo(p);
                      }}
                      className="min-h-11 md:min-h-8 mr-2"
                    >
                      {p.isActive ? t.cat_deactivate : t.cat_activate}
                    </Button>
                    <span className="text-primary">→</span>
                  </TableCell>
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={9} className="p-8.5 text-center text-muted-foreground text-[13px]">
                  {data.length ? t.filter_no : t.proj_none}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
      {errActivo ? (
        <div className="px-4.5 py-2.5 text-[12.5px] text-warn">{errTexto(errActivo)}</div>
      ) : null}
    </Card>
  );
}
