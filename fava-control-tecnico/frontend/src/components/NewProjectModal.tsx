import { useState } from 'react';
import type { ReactNode } from 'react';
import { hi } from '../icons';
import { FieldError, gbtn, inputError, inputStyle, pbtn } from '../ui';
import { useApp } from '../state';
import { CURRENCIES, MACHINES } from '../data';
import type { Project } from '../types';

interface Errors {
  name?: boolean;
  client?: boolean;
  oa?: boolean;
  country?: boolean;
  value?: boolean;
  hours?: boolean;
  machines?: boolean;
}

export default function NewProjectModal() {
  const { t, patch, addProject } = useApp();
  const [name, setName] = useState('');
  const [client, setClient] = useState('');
  const [oa, setOa] = useState('');
  const [country, setCountry] = useState('');
  const [valueRaw, setValueRaw] = useState('');
  const [hoursRaw, setHoursRaw] = useState('');
  const [cur, setCur] = useState('USD');
  const [machines, setMachines] = useState<string[]>([MACHINES[0]]);
  const [errors, setErrors] = useState<Errors>({});

  const close = () => patch({ projOpen: false });
  const toggleMachine = (m: string) =>
    setMachines((ms) => (ms.includes(m) ? ms.filter((x) => x !== m) : [...ms, m]));

  const create = () => {
    const errs: Errors = {};
    if (!name.trim()) errs.name = true;
    if (!client.trim()) errs.client = true;
    if (!oa.trim()) errs.oa = true;
    if (!country.trim()) errs.country = true;
    const value = parseInt((valueRaw || '').replace(/[^0-9]/g, ''), 10);
    const nh = parseInt((hoursRaw || '').replace(/[^0-9]/g, ''), 10);
    if (!value || value <= 0) errs.value = true;
    if (!nh || nh <= 0) errs.hours = true;
    if (!machines.length) errs.machines = true;
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    const zero = () => ({ Montaje: { Mecánico: 0, Meccatronico: 0, Eléctrico: 0 }, Collaudo: { Mecánico: 0, Meccatronico: 0, Eléctrico: 0 } });
    const p: Project = {
      id: 'p' + Date.now(),
      name: name.trim(), client: client.trim(), oa: oa.trim(), country: country.trim(),
      value, cur, nh, machines: machines.slice(),
      sold: zero(), done: zero(),
    };
    addProject(p);
  };

  const field = (label: string, el: ReactNode, e?: boolean, msg?: string) => (
    <div>
      <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>{label}</label>
      {el}
      {e ? <FieldError msg={msg || t.field_req} /> : null}
    </div>
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
          {field(t.proj_name, <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.proj_name_ph} style={errors.name ? inputError : inputStyle} />, errors.name)}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field(t.client, <input value={client} onChange={(e) => setClient(e.target.value)} placeholder={t.proj_client_ph} style={errors.client ? inputError : inputStyle} />, errors.client)}
            {field('OA / Commessa', <input value={oa} onChange={(e) => setOa(e.target.value)} placeholder={t.proj_oa_ph} style={{ ...(errors.oa ? inputError : inputStyle), fontFamily: 'Roboto Mono' }} />, errors.oa)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr .8fr', gap: 12 }}>
            {field(t.proj_country, <input value={country} onChange={(e) => setCountry(e.target.value)} placeholder={t.proj_country_ph} style={errors.country ? inputError : inputStyle} />, errors.country)}
            {field(t.proj_value, <input value={valueRaw} onChange={(e) => setValueRaw(e.target.value)} placeholder="1.240.000" style={{ ...(errors.value ? inputError : inputStyle), fontFamily: 'Roboto Mono' }} />, errors.value, t.val_positive)}
            {field(
              t.proj_cur,
              <select value={cur} onChange={(e) => setCur(e.target.value)} style={inputStyle}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
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
              {MACHINES.map((m) => {
                const on = machines.includes(m);
                return (
                  <button
                    key={m}
                    onClick={() => toggleMachine(m)}
                    style={{ padding: '9px 14px', border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border-2)'), background: on ? 'var(--primary-tint)' : 'var(--surface-2)', color: on ? 'var(--primary)' : 'var(--text-2)', borderRadius: 9, fontWeight: 600, fontSize: 13.5, cursor: 'pointer', fontFamily: 'Roboto Mono', display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    {on ? hi('check', { w: 14 }) : null}
                    {m}
                  </button>
                );
              })}
            </div>,
            errors.machines,
            t.pick_machine,
          )}
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
