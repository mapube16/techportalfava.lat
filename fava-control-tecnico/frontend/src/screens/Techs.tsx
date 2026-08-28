import { useState } from 'react';
import { hi, Dots } from '../icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ApiState, chip, filterBy, initials, inputStyle } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { codigo, useApiData } from '../lib/api/useApiData';
import { activos, getCatalogs } from '../lib/api/catalogs';
import {
  createTechnician, listTechnicians, setTechnicianActive, updateTechnician,
} from '../lib/api/technicians';
import type { EmploymentType, Technician } from '../lib/api/technicians';

/** Alta y edición comparten formulario: lo único que cambia es si lleva `id`. */
interface Form {
  id: string | null;
  fullName: string;
  roleTypeId: string;
  employmentType: EmploymentType;
}

export default function Techs() {
  const { state, t } = useApp();
  const movil = useIsMobile();
  const [form, setForm] = useState<Form | null>(null);
  const [errSave, setErrSave] = useState<string | null>(null);

  // El maestro y el catálogo de roles en paralelo: el selector del formulario sale
  // del catálogo (CAT-02), no de una lista cableada.
  const { data, setData, error } = useApiData(async () => {
    const [techs, cat] = await Promise.all([listTechnicians(), getCatalogs()]);
    return { techs, roleTypes: cat.roleTypes };
  }, [state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const rows = filterBy(data.techs, state.search, (tc) => tc.fullName + ' ' + tc.roleTypeName);
  // El endpoint devuelve activos e inactivos: filtra el selector, no la lista.
  const rolesElegibles = activos(data.roleTypes);

  const guardar = (fila: Technician) =>
    setData({ ...data, techs: data.techs.map((x) => (x.id === fila.id ? fila : x)) });

  const abrirAlta = () =>
    setForm({ id: null, fullName: '', roleTypeId: rolesElegibles[0]?.id ?? '', employmentType: 'INTERNO' });

  const abrirEdicion = (tc: Technician) =>
    setForm({ id: tc.id, fullName: tc.fullName, roleTypeId: tc.roleTypeId, employmentType: tc.employmentType });

  const enviar = () => {
    if (!form || !form.fullName.trim() || !form.roleTypeId) return;
    const cuerpo = {
      fullName: form.fullName.trim(),
      roleTypeId: form.roleTypeId,
      employmentType: form.employmentType,
    };
    setErrSave(null);
    const peticion = form.id ? updateTechnician(form.id, cuerpo) : createTechnician(cuerpo);
    peticion
      .then((tc) => {
        setData(form.id
          ? { ...data, techs: data.techs.map((x) => (x.id === tc.id ? tc : x)) }
          : { ...data, techs: [...data.techs, tc].sort((a, b) => a.fullName.localeCompare(b.fullName, 'es')) });
        setForm(null);
      })
      .catch((e: unknown) => setErrSave(codigo(e)));
  };

  // Desactivar, nunca borrar: el técnico de baja sigue en la lista, atenuado, y su
  // bitácora histórica sigue apuntando a él.
  const conmutarActivo = (tc: Technician) => {
    setErrSave(null);
    setTechnicianActive(tc.id, !tc.isActive)
      .then(guardar)
      .catch((e: unknown) => setErrSave(codigo(e)));
  };

  const addBtn = (
    <Button onClick={abrirAlta} className="min-h-11 md:min-h-9">
      {hi('plus', { w: 15 })}
      {t.btn_newtech}
    </Button>
  );

  const activePill = (active: boolean) => (
    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${active ? 'text-ok' : 'text-muted-foreground'}`}>
      <span className={`size-1.5 rounded-full ${active ? 'bg-ok' : 'bg-muted-foreground'}`} />
      {active ? t.active : t.inactive}
    </span>
  );

  // La etiqueta EXTERNO/INTERNO en el naranja de MARCA, no en el `accent` de hover de
  // shadcn: son dos colores distintos que comparten nombre (ver el puente en index.css).
  const empleoChip = (tc: Technician) => (
    <span className={`${chip} ${tc.employmentType === 'EXTERNO' ? 'bg-accent-tint text-accent-brand' : ''}`}>
      {tc.employmentType === 'EXTERNO' ? t.external : t.internal}
    </span>
  );

  const formulario = form ? (
    <div className="px-4.5 py-3 border-b border-border flex gap-2.5 flex-wrap items-center bg-muted">
      <input
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        placeholder={t.tech_name_ph}
        className={`${inputStyle} w-[220px]`}
      />
      <select
        value={form.roleTypeId}
        onChange={(e) => setForm({ ...form, roleTypeId: e.target.value })}
        className={`${inputStyle} w-[180px]`}
      >
        {rolesElegibles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <select
        value={form.employmentType}
        onChange={(e) => setForm({ ...form, employmentType: e.target.value as EmploymentType })}
        className={`${inputStyle} w-[140px]`}
      >
        <option value="INTERNO">{t.internal}</option>
        <option value="EXTERNO">{t.external}</option>
      </select>
      <Button onClick={enviar} className="min-h-11 md:min-h-9">{t.btn_save}</Button>
      <Button variant="outline" onClick={() => { setForm(null); setErrSave(null); }} className="min-h-11 md:min-h-9">
        {t.btn_cancel}
      </Button>
      {errSave ? <span className="text-xs text-warn">{t.err_save}: {errSave}</span> : null}
    </div>
  ) : errSave ? (
    <div className="px-4.5 py-2.5 text-xs text-warn">{t.err_save}: {errSave}</div>
  ) : null;

  const acciones = (tc: Technician) => (
    <>
      <Button variant="outline" size="icon" onClick={() => abrirEdicion(tc)} title={t.cat_edit} aria-label={t.cat_edit} className="size-11 md:size-9">
        <Dots w={16} />
      </Button>
      <Button variant="outline" size="sm" onClick={() => conmutarActivo(tc)} className="min-h-11 md:min-h-9 ml-1.5">
        {tc.isActive ? t.cat_deactivate : t.cat_activate}
      </Button>
    </>
  );

  if (movil) {
    return (
      <Card className="p-0 gap-0 overflow-hidden">
        <CardHeader className="flex-row items-center justify-between border-b p-4">
          <CardTitle>{t.t_techs}</CardTitle>
          {addBtn}
        </CardHeader>
        {formulario}
        <CardContent className="p-3 flex flex-col gap-2.5">
          {rows.map((tc) => (
            <div key={tc.id} className={`border border-border rounded-card p-3.5 ${tc.isActive ? '' : 'opacity-55'}`}>
              <div className="flex items-center gap-2.5">
                <div className="size-8.5 rounded-full bg-muted grid place-items-center text-xs font-bold shrink-0">
                  {initials(tc.fullName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold">{tc.fullName}</div>
                  <div className="text-xs text-muted-foreground">{tc.roleTypeName}</div>
                </div>
                {empleoChip(tc)}
              </div>
              <div className="flex items-center gap-2.5 mt-2.5">
                {activePill(tc.isActive)}
                <span className="flex-1" />
                {acciones(tc)}
              </div>
            </div>
          ))}
          {rows.length ? null : (
            <div className="p-5 text-center text-muted-foreground text-[13px]">{t.empty_list}</div>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="p-0 gap-0 overflow-hidden">
      <CardHeader className="flex-row items-center justify-between border-b p-4">
        <CardTitle>{t.t_techs}</CardTitle>
        {addBtn}
      </CardHeader>
      {formulario}
      <CardContent className="p-0 overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.col_tech}</TableHead>
              <TableHead>{t.role_type}</TableHead>
              <TableHead />
              <TableHead>{t.util}</TableHead>
              <TableHead>{t.col_status}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((tc) => (
              <TableRow key={tc.id} className={tc.isActive ? '' : 'opacity-55'}>
                <TableCell>
                  <div className="flex items-center gap-2.5">
                    <div className="size-7.5 rounded-full bg-muted grid place-items-center text-[11px] font-bold">
                      {initials(tc.fullName)}
                    </div>
                    <span className="font-semibold">{tc.fullName}</span>
                  </div>
                </TableCell>
                <TableCell>{tc.roleTypeName}</TableCell>
                <TableCell>{empleoChip(tc)}</TableCell>
                {/* La utilización sale de la bitácora, que llega en la Fase 3 y se agrega
                    en la Fase 7. Una barra al 0 % sería una cifra falsa, no un dato vacío. */}
                <TableCell className="text-muted-foreground" title={t.tech_no_util}>—</TableCell>
                <TableCell>{activePill(tc.isActive)}</TableCell>
                <TableCell className="text-right whitespace-nowrap">{acciones(tc)}</TableCell>
              </TableRow>
            ))}
            {rows.length ? null : (
              <TableRow>
                <TableCell colSpan={6} className="p-8.5 text-center text-muted-foreground text-[13px]">
                  {t.empty_list}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
