import { useState } from 'react';
import { hi, Dots } from '../icons';
import { ApiState, Card, CardHead, chip, filterBy, gbtn, initials, inputStyle, pbtn, td, th } from '../ui';
import { useApp } from '../state';
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
    <button onClick={abrirAlta} style={pbtn}>
      {hi('plus', { w: 15 })}
      {t.btn_newtech}
    </button>
  );

  const activePill = (active: boolean) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: active ? 'var(--ok)' : 'var(--text-3)' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: active ? 'var(--ok)' : 'var(--text-3)' }} />
      {active ? t.active : t.inactive}
    </span>
  );

  const formulario = form ? (
    <div style={{ padding: '12px 18px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', background: 'var(--surface-2)' }}>
      <input
        value={form.fullName}
        onChange={(e) => setForm({ ...form, fullName: e.target.value })}
        placeholder={t.tech_name_ph}
        style={{ ...inputStyle, width: 220 }}
      />
      <select
        value={form.roleTypeId}
        onChange={(e) => setForm({ ...form, roleTypeId: e.target.value })}
        style={{ ...inputStyle, width: 180 }}
      >
        {rolesElegibles.map((r) => (
          <option key={r.id} value={r.id}>{r.name}</option>
        ))}
      </select>
      <select
        value={form.employmentType}
        onChange={(e) => setForm({ ...form, employmentType: e.target.value as EmploymentType })}
        style={{ ...inputStyle, width: 140 }}
      >
        <option value="INTERNO">{t.internal}</option>
        <option value="EXTERNO">{t.external}</option>
      </select>
      <button onClick={enviar} style={pbtn}>{t.btn_save}</button>
      <button onClick={() => { setForm(null); setErrSave(null); }} style={gbtn}>{t.btn_cancel}</button>
      {errSave ? <span style={{ fontSize: 12, color: 'var(--warn)' }}>{t.err_save}: {errSave}</span> : null}
    </div>
  ) : errSave ? (
    <div style={{ padding: '10px 18px', fontSize: 12, color: 'var(--warn)' }}>{t.err_save}: {errSave}</div>
  ) : null;

  const acciones = (tc: Technician) => (
    <>
      <button onClick={() => abrirEdicion(tc)} title={t.cat_edit} style={gbtn}><Dots w={16} /></button>
      <button onClick={() => conmutarActivo(tc)} style={{ ...gbtn, marginLeft: 6 }}>
        {tc.isActive ? t.cat_deactivate : t.cat_activate}
      </button>
    </>
  );

  if (state.mobile) {
    return (
      <Card>
        <CardHead title={t.t_techs} right={addBtn} />
        {formulario}
        <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {rows.map((tc) => (
            <div key={tc.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 13, opacity: tc.isActive ? 1 : 0.55 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{initials(tc.fullName)}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{tc.fullName}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{tc.roleTypeName}</div>
                </div>
                <span style={chip(tc.employmentType === 'EXTERNO' ? 'var(--accent-tint)' : 'var(--surface-3)', tc.employmentType === 'EXTERNO' ? 'var(--accent)' : 'var(--text-2)')}>
                  {tc.employmentType === 'EXTERNO' ? t.external : t.internal}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 11 }}>
                {activePill(tc.isActive)}
                <span style={{ flex: 1 }} />
                {acciones(tc)}
              </div>
            </div>
          ))}
          {rows.length ? null : <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t.empty_list}</div>}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHead title={t.t_techs} right={addBtn} />
      {formulario}
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              {[t.col_tech, t.role_type, '', t.util, t.col_status, ''].map((c, i) => (
                <th key={i} style={th}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((tc) => (
              <tr key={tc.id} style={{ borderTop: '1px solid var(--border)', opacity: tc.isActive ? 1 : 0.55 }}>
                <td style={td}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700 }}>{initials(tc.fullName)}</div>
                    <span style={{ fontWeight: 600 }}>{tc.fullName}</span>
                  </div>
                </td>
                <td style={td}>{tc.roleTypeName}</td>
                <td style={td}>
                  <span style={chip(tc.employmentType === 'EXTERNO' ? 'var(--accent-tint)' : 'var(--surface-3)', tc.employmentType === 'EXTERNO' ? 'var(--accent)' : 'var(--text-2)')}>
                    {tc.employmentType === 'EXTERNO' ? t.external : t.internal}
                  </span>
                </td>
                {/* La utilización sale de la bitácora, que llega en la Fase 3 y se agrega
                    en la Fase 7. Una barra al 0 % sería una cifra falsa, no un dato vacío. */}
                <td style={{ ...td, color: 'var(--text-3)' }} title={t.tech_no_util}>—</td>
                <td style={td}>{activePill(tc.isActive)}</td>
                <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>{acciones(tc)}</td>
              </tr>
            ))}
            {rows.length ? null : (
              <tr><td colSpan={6} style={{ padding: 34, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t.empty_list}</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
