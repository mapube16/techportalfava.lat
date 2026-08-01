import { useState } from 'react';
import type { ReactNode } from 'react';
import { hi } from '../icons';
import { FieldError, gbtn, inputError, inputStyle, pbtn } from '../ui';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { activos, getCatalogs } from '../lib/api/catalogs';
import { createOrder, createProject } from '../lib/api/projects';

/**
 * Los campos del encabezado son EXACTAMENTE los que imprimirá la Nota Semanal
 * (Fase 5): cliente, NIT, localidad, país, suministro, n° de contrato y maquinaria.
 *
 * OJO Fase 5: el «NIT:» del PDF real es el de FAVA (constante del membrete), NO este
 * `clientNit`. Se captura porque CAT-03 lo pide, no para esa casilla.
 *
 * Desde la Fase 2.1 el modal crea el proyecto y su PRIMERA máquina contratada. Ya no
 * hay multiselección de modelos: cada máquina lleva su propia commessa, su OA y su
 * importe (JAV tiene tres, con tres importes distintos), y repartir un único valor
 * entre varias sería inventárselo. Las siguientes se añaden desde el detalle.
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
  machineLabel?: boolean;
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
  const [commessa, setCommessa] = useState('');
  const [machineLabel, setMachineLabel] = useState('');
  const [machineModelId, setMachineModelId] = useState('');
  const [valueRaw, setValueRaw] = useState('');
  const [hoursRaw, setHoursRaw] = useState('');
  const [moneda, setMoneda] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [errApi, setErrApi] = useState<string | null>(null);

  // Monedas y modelos de máquina del catálogo global (CAT-01): los inactivos no se
  // ofrecen en un formulario nuevo, pero siguen existiendo en los registros viejos.
  const { data: cat } = useApiData(getCatalogs, []);
  const monedas = activos(cat?.currencies ?? []);
  const modelos = activos(cat?.machineModels ?? []);

  const close = () => patch({ projOpen: false });

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
    if (!machineLabel.trim()) errs.machineLabel = true;
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrApi(null);
    // Dos peticiones porque son dos recursos: el POST del proyecto rechaza los campos
    // comerciales en el cuerpo (400 RECURSO_APARTE) porque viven en la orden.
    createProject({
      name: name.trim(),
      clientName: client.trim(),
      clientNit: nit.trim() || null,
      locality: locality.trim(),
      country: country.trim(),
      supply: supply.trim(),
      contractNumber: contractNumber.trim(),
      normalHours: nh,
    })
      .then(async (p) => {
        await createOrder(p.id, {
          label: machineLabel.trim(),
          machineModelId: machineModelId || null,
          commessa: commessa.trim() || null,
          // Los 4 primeros dígitos son como se nombra la máquina en obra («3428»).
          commessaShort: commessa.trim().slice(0, 4) || null,
          oaNumber: oa.trim() || null,
          contractValue: value,
          currencyCode: monedas.length ? moneda || monedas[0].code : null,
        });
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
      className={`${err ? inputError : inputStyle} ${mono ? 'font-mono' : ''}`}
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
          <button onClick={close} className={`${gbtn} px-2.5`}>{hi('x', { w: 15 })}</button>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {field(t.order_oa, texto(oa, setOa, t.proj_oa_ph, true))}
            {field(t.order_commessa, texto(commessa, setCommessa, '342898', true))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr .8fr', gap: 12 }}>
            {field(t.proj_value, texto(valueRaw, setValueRaw, '1.240.000', true, errors.value), errors.value, t.val_positive)}
            {field(
              t.proj_cur,
              <select value={moneda || monedas[0]?.code || ''} onChange={(e) => setMoneda(e.target.value)} className={inputStyle}>
                {monedas.map((c) => (
                  <option key={c.code} value={c.code}>{c.code}</option>
                ))}
              </select>,
            )}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>{t.proj_hours}</label>
            <div style={{ position: 'relative' }}>
              <input value={hoursRaw} onChange={(e) => setHoursRaw(e.target.value)} placeholder="1.120" className={`${errors.hours ? inputError : inputStyle} font-mono pr-10`} />
              <span style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: 'var(--text-3)', fontWeight: 600 }}>h</span>
            </div>
            {errors.hours ? <FieldError msg={t.val_positive} /> : <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 5 }}>{t.proj_hours_hint}</div>}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 12 }}>
            {field(
              t.order_label,
              texto(machineLabel, setMachineLabel, 'PL 6000 KG - 1-3428', false, errors.machineLabel),
              errors.machineLabel,
              t.pick_machine,
            )}
            {field(
              t.order_model,
              <select
                value={machineModelId}
                onChange={(e) => setMachineModelId(e.target.value)}
                className={inputStyle}
              >
                {/* Opcional: hay alcances contratados que no son un modelo del
                    catálogo, como «PC 4000 -3430 + 4 SILOS». */}
                <option value="">{t.order_no_model}</option>
                {modelos.map((m) => (
                  <option key={m.id} value={m.id}>{m.code}</option>
                ))}
              </select>,
            )}
          </div>
          {errApi ? <FieldError msg={`${t.err_save}: ${errApi}`} /> : null}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={close} className={gbtn}>{t.btn_cancel}</button>
            <button onClick={create} className={pbtn}>
              {hi('plus', { w: 15 })}
              {t.btn_newproj}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
