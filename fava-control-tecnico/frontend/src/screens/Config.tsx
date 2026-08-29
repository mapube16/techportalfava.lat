import { useState } from 'react';
import { Dots } from '../icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiState, inputStyle } from '../ui';
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
  const { t, errTexto } = useApp();
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
    <Card className="p-0 gap-0 overflow-hidden">
      <CardHeader className="border-b p-4">
        <CardTitle>{p.title}</CardTitle>
      </CardHeader>
      <CardContent className="px-4.5 py-2">
        {p.filas.map((f, i) => (
          <div
            key={f.id}
            className={`flex items-center gap-2.5 py-2.5 flex-wrap ${i ? 'border-t border-border' : ''} ${f.isActive ? '' : 'opacity-50'}`}
          >
            {editando === f.id ? (
              <>
                {campos(!!f.fijo)}
                <Button size="sm" onClick={() => lanzar(p.onEdit(f.id, uno.trim(), dos.trim()))} className="min-h-11 md:min-h-8">
                  {t.btn_save}
                </Button>
                <Button variant="outline" size="sm" onClick={limpiar} className="min-h-11 md:min-h-8">
                  {t.btn_cancel}
                </Button>
              </>
            ) : (
              <>
                <span className="font-mono text-[12.5px] font-semibold min-w-[78px]">{f.principal}</span>
                <span className="flex-1 text-[13px] text-muted-foreground min-w-[90px]">{f.secundario}</span>
                {p.canEdit ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => editar(f)} className="min-h-11 md:min-h-8">
                      {t.cat_edit}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => lanzar(p.onToggle(f.id, !f.isActive))} className="min-h-11 md:min-h-8">
                      {f.isActive ? t.cat_deactivate : t.cat_activate}
                    </Button>
                  </>
                ) : null}
              </>
            )}
          </div>
        ))}
        {p.canEdit ? (
          <div className="flex items-center gap-2.5 pt-3 pb-1 border-t border-border flex-wrap">
            {editando === null ? (
              <>
                {campos(false)}
                <Button size="sm" onClick={() => lanzar(p.onCreate(uno.trim(), dos.trim()))} className="min-h-11 md:min-h-8">
                  {t.cat_add}
                </Button>
              </>
            ) : null}
          </div>
        ) : null}
        {err ? <div className="text-xs text-warn pb-2">{errTexto(err)}</div> : null}
      </CardContent>
    </Card>
  );
}

export default function Config() {
  const { state, t, errTexto } = useApp();
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
    <div className={`grid gap-4 max-w-[900px] ${movil ? 'grid-cols-1' : 'grid-cols-2'}`}>
      <div className="flex flex-col gap-4">
        <Card className="p-0 gap-0 overflow-hidden">
          <CardHeader className="flex-row items-center justify-between border-b p-4">
            <CardTitle>{t.config_concepts}</CardTitle>
            {isSuper ? null : <span className="text-xs text-muted-foreground">{t.cat_only_super}</span>}
          </CardHeader>
          <CardContent className="px-4.5 py-2">
            {/* Los 8 códigos son fijos por enum de Postgres: aquí solo se editan las
                etiquetas ES/IT, que es lo único que CAT-01 deja tocar. */}
            {cat.concepts.map((c, i) => (
              <div key={c.code} className={`flex items-center gap-3 py-2.5 flex-wrap ${i ? 'border-t border-border' : ''}`}>
                {/* El color del concepto sale del CATÁLOGO, una fila por código: no es
                    una paleta que Tailwind pueda generar como clase en compilación. */}
                <span
                  className="font-mono text-xs font-semibold text-white px-1.5 py-1 rounded min-w-11 text-center"
                  style={{ background: CONCEPT_COLOR[c.code] || 'var(--text-3)' }}
                >
                  {c.code}
                </span>
                {edit === c.code ? (
                  <>
                    <input value={labelEs} onChange={(e) => setLabelEs(e.target.value)} placeholder={t.cat_label_es} className={`${inputStyle} w-[150px]`} />
                    <input value={labelIt} onChange={(e) => setLabelIt(e.target.value)} placeholder={t.cat_label_it} className={`${inputStyle} w-[150px]`} />
                    <Button size="sm" onClick={() => guardarConcepto(c.code)} className="min-h-11 md:min-h-8">
                      {t.btn_save}
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEdit(null)} className="min-h-11 md:min-h-8">
                      {t.btn_cancel}
                    </Button>
                  </>
                ) : (
                  <>
                    {/* El catálogo del API solo guarda ES e IT (columnas `label_es` y
                        `label_it`). En portugués se cae al español, que es el idioma
                        más cercano de los dos — mejor eso que una etiqueta vacía. */}
                    <span className="flex-1 text-[13.5px]">{state.lang === 'it' ? c.labelIt : c.labelEs}</span>
                    {isSuper ? (
                      <Button
                        variant="outline"
                        size="icon"
                        onClick={() => { setEdit(c.code); setLabelEs(c.labelEs); setLabelIt(c.labelIt); setErr(null); }}
                        title={t.cat_edit}
                        aria-label={t.cat_edit}
                        className="size-11 md:size-8"
                      >
                        <Dots w={16} />
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
            ))}
            {err ? <div className="text-xs text-warn pb-2">{errTexto(err)}</div> : null}
          </CardContent>
        </Card>

        <Card className="p-0 gap-0 overflow-hidden">
          <CardHeader className="border-b p-4">
            <CardTitle>{t.config_general}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {generales.map((r) => (
              <div key={r[0]} className="flex justify-between text-[13.5px]">
                <span className="text-muted-foreground">{r[0]}</span>
                <b>{r[1]}</b>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-col gap-4">
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
