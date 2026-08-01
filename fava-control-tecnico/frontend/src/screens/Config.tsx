import { useState } from 'react';
import { Dots } from '../icons';
import { ApiState, Card, CardHead, gbtn, inputStyle, pbtn } from '../ui';
import { CONCEPT_COLOR } from '../i18n';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { codigo, useApiData } from '../lib/api/useApiData';
import {
  createCurrency, createMachineModel, createRoleType, getCatalogs,
  updateConcept, updateCurrency, updateMachineModel, updateRoleType,
} from '../lib/api/catalogs';
import type { Catalogs } from '../lib/api/catalogs';

/**
 * Una fila de catálogo tal como la pinta `CatalogCard`: un campo principal (nombre o
 * código) y otro opcional (símbolo o descripción). `fijo` marca el que no se puede
 * editar porque ES la clave — el código de moneda.
 */
interface Fila {
  id: string;
  principal: string;
  secundario: string;
  fijo?: boolean;
  isActive: boolean;
}

interface CatalogCardProps {
  title: string;
  filas: Fila[];
  phPrincipal: string;
  phSecundario?: string;
  canEdit: boolean;
  onCreate: (principal: string, secundario: string) => Promise<unknown>;
  onEdit: (id: string, principal: string, secundario: string) => Promise<unknown>;
  onToggle: (id: string, isActive: boolean) => Promise<unknown>;
  onDone: () => void;
}

/**
 * El ABM de roles técnicos, monedas y modelos de máquina es la misma tabla de tres
 * columnas tres veces: un componente parametrizado en vez de tres copias.
 * Sin borrado: la baja es `isActive`, y el inactivo sigue visible (atenuado) porque
 * los registros históricos lo siguen usando.
 */
function CatalogCard(p: CatalogCardProps) {
  const { t } = useApp();
  const [editando, setEditando] = useState<string | null>(null);
  const [uno, setUno] = useState('');
  const [dos, setDos] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const limpiar = () => {
    setEditando(null);
    setUno('');
    setDos('');
  };

  const lanzar = (peticion: Promise<unknown>) => {
    setErr(null);
    peticion
      .then(() => {
        limpiar();
        p.onDone();
      })
      .catch((e: unknown) => setErr(codigo(e)));
  };

  const editar = (f: Fila) => {
    setEditando(f.id);
    setUno(f.principal);
    setDos(f.secundario);
    setErr(null);
  };

  const campos = (soloSecundario: boolean) => (
    <>
      <input
        value={uno}
        disabled={soloSecundario}
        onChange={(e) => setUno(e.target.value)}
        placeholder={p.phPrincipal}
        className={`${inputStyle} w-[150px] ${soloSecundario ? 'opacity-60' : ''}`}
      />
      {p.phSecundario ? (
        <input
          value={dos}
          onChange={(e) => setDos(e.target.value)}
          placeholder={p.phSecundario}
          className={`${inputStyle} w-[150px]`}
        />
      ) : null}
    </>
  );

  return (
    <Card>
      <CardHead title={p.title} />
      <div style={{ padding: '8px 18px' }}>
        {p.filas.map((f, i) => (
          <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap', opacity: f.isActive ? 1 : 0.5 }}>
            {editando === f.id ? (
              <>
                {campos(!!f.fijo)}
                <button onClick={() => lanzar(p.onEdit(f.id, uno.trim(), dos.trim()))} className={pbtn}>{t.btn_save}</button>
                <button onClick={limpiar} className={gbtn}>{t.btn_cancel}</button>
              </>
            ) : (
              <>
                <span style={{ fontFamily: 'Roboto Mono', fontSize: 12.5, fontWeight: 600, minWidth: 78 }}>{f.principal}</span>
                <span style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', minWidth: 90 }}>{f.secundario}</span>
                {p.canEdit ? (
                  <>
                    <button onClick={() => editar(f)} className={gbtn}>{t.cat_edit}</button>
                    <button onClick={() => lanzar(p.onToggle(f.id, !f.isActive))} className={gbtn}>
                      {f.isActive ? t.cat_deactivate : t.cat_activate}
                    </button>
                  </>
                ) : null}
              </>
            )}
          </div>
        ))}
        {p.canEdit ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0 4px', borderTop: '1px solid var(--border)', flexWrap: 'wrap' }}>
            {editando === null ? (
              <>
                {campos(false)}
                <button onClick={() => lanzar(p.onCreate(uno.trim(), dos.trim()))} className={pbtn}>{t.cat_add}</button>
              </>
            ) : null}
          </div>
        ) : null}
        {err ? <div style={{ fontSize: 12, color: 'var(--warn)', paddingBottom: 8 }}>{t.err_save}: {err}</div> : null}
      </div>
    </Card>
  );
}

export default function Config() {
  const { state, t } = useApp();
  const movil = useIsMobile();
  // Los permisos son del servidor (403 para quien no sea S); esto solo evita ofrecer
  // controles que no van a funcionar.
  const isSuper = state.role === 'S';
  const [edit, setEdit] = useState<string | null>(null);
  const [labelEs, setLabelEs] = useState('');
  const [labelIt, setLabelIt] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const { data, setData, error } = useApiData(getCatalogs, [state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const cat: Catalogs = data;
  const recargar = () => getCatalogs().then(setData).catch(() => {});

  const guardarConcepto = (code: string) => {
    setErr(null);
    updateConcept(code, { labelEs: labelEs.trim(), labelIt: labelIt.trim() })
      .then((c) => {
        setData({ ...cat, concepts: cat.concepts.map((x) => (x.code === c.code ? c : x)) });
        setEdit(null);
      })
      .catch((e: unknown) => setErr(codigo(e)));
  };

  const generales: [string, string][] = [
    [t.density, state.density === 'compact' ? t.compact : t.comfortable],
    [t.lang_row, t.lang_label],
    [t.theme_row, state.theme === 'dark' ? t.theme_dark : t.theme_light],
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: movil ? '1fr' : '1fr 1fr', gap: 16, maxWidth: 900 }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <CardHead title={t.config_concepts} right={isSuper ? null : <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.cat_only_super}</span>} />
          <div style={{ padding: '8px 18px' }}>
            {/* Los 8 códigos son fijos por enum de Postgres: aquí solo se editan las
                etiquetas ES/IT, que es lo único que CAT-01 deja tocar. */}
            {cat.concepts.map((c, i) => (
              <div key={c.code} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
                <span style={{ fontFamily: 'Roboto Mono', fontSize: 12, fontWeight: 600, color: '#fff', background: CONCEPT_COLOR[c.code] || 'var(--text-3)', padding: '3px 7px', borderRadius: 5, minWidth: 44, textAlign: 'center' }}>{c.code}</span>
                {edit === c.code ? (
                  <>
                    <input value={labelEs} onChange={(e) => setLabelEs(e.target.value)} placeholder={t.cat_label_es} className={`${inputStyle} w-[150px]`} />
                    <input value={labelIt} onChange={(e) => setLabelIt(e.target.value)} placeholder={t.cat_label_it} className={`${inputStyle} w-[150px]`} />
                    <button onClick={() => guardarConcepto(c.code)} className={pbtn}>{t.btn_save}</button>
                    <button onClick={() => setEdit(null)} className={gbtn}>{t.btn_cancel}</button>
                  </>
                ) : (
                  <>
                    <span style={{ flex: 1, fontSize: 13.5 }}>{state.lang === 'es' ? c.labelEs : c.labelIt}</span>
                    {isSuper ? (
                      <button
                        onClick={() => { setEdit(c.code); setLabelEs(c.labelEs); setLabelIt(c.labelIt); setErr(null); }}
                        title={t.cat_edit}
                        className={`${gbtn} px-2 py-1.5`}
                      >
                        <Dots w={16} />
                      </button>
                    ) : null}
                  </>
                )}
              </div>
            ))}
            {err ? <div style={{ fontSize: 12, color: 'var(--warn)', paddingBottom: 8 }}>{t.err_save}: {err}</div> : null}
          </div>
        </Card>
        <Card>
          <CardHead title={t.config_general} />
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {generales.map((r) => (
              <div key={r[0]} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                <span style={{ color: 'var(--text-2)' }}>{r[0]}</span>
                <b>{r[1]}</b>
              </div>
            ))}
          </div>
        </Card>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <CatalogCard
          title={t.config_roles}
          filas={cat.roleTypes.map((r) => ({ id: r.id, principal: r.name, secundario: '', isActive: r.isActive }))}
          phPrincipal={t.cat_role_ph}
          canEdit={isSuper}
          onCreate={(nombre) => createRoleType(nombre)}
          onEdit={(id, nombre) => updateRoleType(id, { name: nombre })}
          onToggle={(id, isActive) => updateRoleType(id, { isActive })}
          onDone={recargar}
        />
        <CatalogCard
          title={t.config_currency}
          filas={cat.currencies.map((c) => ({ id: c.code, principal: c.code, secundario: c.symbol, fijo: true, isActive: c.isActive }))}
          phPrincipal={t.cat_code_ph}
          phSecundario={t.cat_symbol_ph}
          canEdit={isSuper}
          onCreate={(cod, simbolo) => createCurrency(cod, simbolo)}
          onEdit={(cod, _fijo, simbolo) => updateCurrency(cod, { symbol: simbolo })}
          onToggle={(cod, isActive) => updateCurrency(cod, { isActive })}
          onDone={recargar}
        />
        <CatalogCard
          title={t.config_machines}
          filas={cat.machineModels.map((m) => ({ id: m.id, principal: m.code, secundario: m.description ?? '', isActive: m.isActive }))}
          phPrincipal={t.cat_machine_ph}
          phSecundario={t.cat_desc_ph}
          canEdit={isSuper}
          onCreate={(cod, desc) => createMachineModel(cod, desc || undefined)}
          onEdit={(id, cod, desc) => updateMachineModel(id, { code: cod, description: desc })}
          onToggle={(id, isActive) => updateMachineModel(id, { isActive })}
          onDone={recargar}
        />
      </div>
    </div>
  );
}
