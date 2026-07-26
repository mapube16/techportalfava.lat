import { useState } from 'react';
import type { ReactNode } from 'react';
import { hi } from '../icons';
import { FieldError, gbtn, inputError, inputStyle, pbtn } from '../ui';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { activos, getCatalogs } from '../lib/api/catalogs';
import { createProject, setProjectMachines } from '../lib/api/projects';

/**
 * Los campos del encabezado son EXACTAMENTE los que imprimirá la Nota Semanal
 * (Fase 5): cliente, NIT, localidad, país, suministro, n° de contrato y maquinaria.
 *
 * OJO Fase 5: el «NIT:» del PDF real es el de FAVA (constante del membrete), NO este
 * `clientNit`. Se captura porque CAT-03 lo pide, no para esa casilla.
 */
interface Errors {
  name?: boolean;
  client?: boolean;
  locality?: boolean;
  country?: boolean;
  supply?: boolean;
  contractNumber?: boolean;
  value?: boolean;
  hours?: boolean;
  machines?: boolean;
}

export default function NewProjectModal() {
  const { t, patch, go, refresh, showToast } = useApp();
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [nit, setNit] = useState('');
  const [locality, setLocality] = useState('');
  const [country, setCountry] = useState('');
  const [supply, setSupply] = useState('');
  const [contractNumber, setContractNumber] = useState('');
  const [oa, setOa] = useState('');
  const [valueRaw, setValueRaw] = useState('');
  const [hoursRaw, setHoursRaw] = useState('');
  const [moneda, setMoneda] = useState('');
  const [machines, setMachines] = useState<string[]>([]);
  const [errors, setErrors] = useState<Errors>({});
  const [errApi, setErrApi] = useState<string | null>(null);

  // Monedas y modelos de máquina del catálogo global (CAT-01): los inactivos no se
  // ofrecen en un formulario nuevo, pero siguen existiendo en los registros viejos.
  const { data: cat } = useApiData(getCatalogs, []);
  const monedas = activos(cat?.currencies ?? []);
  const modelos = activos(cat?.machineModels ?? []);

  const close = () => patch({ projOpen: false });
  const toggleMachine = (m: string) =>
    setMachines((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));

  const create = () => {
    const errs: Errors = {};
    if (!name.trim()) errs.name = true;
    if (!client.trim()) errs.client = true;
    if (!locality.trim()) errs.locality = true;
    if (!country.trim()) errs.country = true;
    if (!supply.trim()) errs.supply = true;
    if (!contractNumber.trim()) errs.contractNumber = true;
    const value = parseInt((valueRaw || '').replace(/[^0-9]/g, ''), 10);
    const nh = parseInt((hoursRaw || '').replace(/[^0-9]/g, ''), 10);
    if (!value || value <= 0) errs.value = true;
    if (!nh || nh <= 0) errs.hours = true;
    if (!machines.length) errs.machines = true;
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrApi(null);
    // Dos peticiones porque son dos recursos: el POST rechaza `machines` en el cuerpo
    // (400 RECURSO_APARTE) y la selección tiene su propio PUT idempotente.
    createProject({
      name: name.trim(),
      clientName: client.trim(),
      clientNit: nit.trim() || null,
      locality: locality.trim(),
      country: country.trim(),
      supply: supply.trim(),
      contractNumber: contractNumber.trim(),
      oaNumber: oa.trim() || null,
      contractValue: value,
      currencyCode: monedas.length ? moneda || monedas[0].code : null,
      normalHours: nh,
    })
      .then(async (p) => {
        await setProjectMachines(p.id, machines);
        patch({ projOpen: false, selProject: p.id });
        refresh();
        showToast('proj');
        go('project');
      })
      .catch((e: unknown) => setErrApi(codigo(e)));
  };

  const field = (label: string, el: ReactNode, e?: boolean, msg?: string) => (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>{label}</label>
      {el}
      {e ? <FieldError msg={msg || t.field_req} /> : null}
    </div>
  );

  const texto = (v: string, set: (s: string) => void, ph: string, mono?: boolean, err?: boolean) => (
    <input
      value={v}
      onChange={(e) => set(e.target.value)}
      placeholder={ph}
      style={{ ...(err ? inputError : inputStyle), ...(mono ? { fontFamily: 'Roboto Mono' } : null) }}
    />
  );

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(8,16,24,.5)', zIndex: 60, display: 'grid', placeItems: 'center', padding: 20, animation: 'favaIn .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 560, background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', maxHeight: '92vh', overflowY: 'auto', animation: 'favaIn .26s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 22px 4px' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{t.proj_new}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, maxWidth: 340 }}>{t.proj_new_sub}</div>
          </div>
          <button onClick={close} style={{ ...gbtn, padding: '8px 10px' }}>{hi('x', { w: 15 })}</button>
        </div>
        <div style={{ padding: '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {field(t.proj_name, texto(name, setName, t.proj_name_ph, false, errors.name), errors.name)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field(t.client, texto(client, setClient, t.proj_client_ph, false, errors.client), errors.client)}
            {field(t.proj_nit, texto(nit, setNit, t.proj_nit_ph, true))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field(t.proj_locality, texto(locality, setLocality, t.proj_locality_ph, false, errors.locality), errors.locality)}
            {field(t.proj_country, texto(country, setCountry, t.proj_country_ph, false, errors.country), errors.country)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field(t.proj_supply, texto(supply, setSupply, t.proj_supply_ph, false, errors.supply), errors.supply)}
            {field(t.proj_contract_no, texto(contractNumber, setContractNumber, t.proj_contract_no_ph, true, errors.contractNumber), errors.contractNumber)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr .8fr', gap: 12 }}>
            {field('OA / Commessa', texto(oa, setOa, t.proj_oa_ph, true))}
            {field(t.proj_value, texto(valueRaw, setValueRaw, '1.240.000', true, errors.value), errors.value, t.val_positive)}
            {field(
              t.proj_cur,
              <select value={moneda || monedas[0]?.code || ''} onChange={(e) => setMoneda(e.target.value)} style={inputStyle}>
                {monedas.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>,
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>{t.proj_hours}</label>
            <div style={{ position: 'relative' }}>
              <input value={hoursRaw} onChange={(e) => setHoursRaw(e.target.value)} placeholder="1.120" style={{ ...(errors.hours ? inputError : inputStyle), fontFamily: 'Roboto Mono', paddingRight: 38 }} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>h</span>
            </div>
            {errors.hours ? <FieldError msg={t.val_positive} /> : <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>{t.proj_hours_hint}</div>}
          </div>
          {field(
            t.machines,
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {modelos.map((m) => {
                const on = machines.includes(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggleMachine(m.id)}
                    title={m.description ?? ''}
                    style={{ padding: '9px 14px', border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border-2)'), background: on ? 'var(--primary-tint)' : 'var(--surface-2)', color: on ? 'var(--primary)' : 'var(--text-2)', borderRadius: 9, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'Roboto Mono', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {on ? hi('check', { w: 14 }) : null}
                    {m.code}
                  </button>
                );
              })}
            </div>,
            errors.machines,
            t.pick_machine,
          )}
          {errApi ? <FieldError msg={`${t.err_save}: ${errApi}`} /> : null}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={close} style={gbtn}>{t.btn_cancel}</button>
            <button onClick={create} style={pbtn}>
              {hi('plus', { w: 15 })}
              {t.btn_newproj}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
