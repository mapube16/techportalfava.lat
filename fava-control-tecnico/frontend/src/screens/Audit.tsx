import { useState } from 'react';
import type { ReactNode } from 'react';
import { hi } from '../icons';
import { ApiState, Card, CardHead, filterBy, ghostBtn, inputStyle, td, th } from '../ui';
import { useApp } from '../state';
import { useIsMobile } from '../lib/useIsMobile';
import { useApiData } from '../lib/api/useApiData';
import { listAudit } from '../lib/api/weeklyNotes';
import { describir } from '../lib/auditoria';
import type { AuditRow } from '../lib/api/weeklyNotes';
import type { Dict } from '../i18n';
import type { Route } from '../types';

/**
 * AUD-02 — el visor del Super Admin.
 *
 * Solo lee. No hay botón de exportar ni de borrar: el `audit_log` es append-only por
 * motor (sin política de UPDATE ni DELETE, y sin privilegio), así que una UI que
 * sugiriera lo contrario estaría mintiendo sobre lo que se puede hacer.
 *
 * CADA FILA ES UNA FRASE, y esto es el cambio: antes eran siete columnas contando la
 * fila de la base de datos —`approve`, `status: submitted`, `status: approved`— tres
 * veces el mismo hecho, en vocabulario de tabla, y con lo único que de verdad cambiaba
 * (los gastos) volcado entero a los dos lados para compararlo a ojo. La frase la arma
 * `lib/auditoria.ts`, que es donde se puede probar.
 */

/** Icono y color por acción. Decoración: una acción nueva cae en el default. */
const ACCION: Record<string, [icono: string, color: string]> = {
  approve: ['check', 'text-ok'],
  return: ['ureturn', 'text-warn'],
  submit: ['up', 'text-sent'],
  reopen: ['ureturn', 'text-sent'],
  update: ['pencil', 'text-ink-2'],
  deactivate: ['x', 'text-warn'],
};

/** Fecha y hora LOCALES: el instante viene en ISO y aquí sí manda el reloj del lector. */
const cuando = (iso: string) => {
  const d = new Date(iso);
  const dos = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())} ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

/**
 * El registro entero, tal como está guardado.
 *
 * La frase de arriba es una VISTA; la prueba es esto. Por eso no se esconde, solo deja
 * de ir primero: `<details>` nativo, sin estado ni librería, cerrado por defecto.
 */
function Original({ fila, t }: { fila: AuditRow; t: Dict }) {
  return (
    <details className="mt-1">
      <summary className="w-fit cursor-pointer select-none text-[11px] text-ink-3 hover:text-ink-2">
        {t.aud_raw}
      </summary>
      <pre className="mt-1 max-w-[460px] whitespace-pre-wrap break-all rounded-md bg-surface-2 p-2 font-mono text-[11px] leading-snug text-ink-2">
        {JSON.stringify(fila, null, 2)}
      </pre>
    </details>
  );
}

/** Qué pasó: el verbo, el motivo pegado a él y el registro debajo. */
function Que({ fila, t }: { fila: AuditRow; t: Dict }) {
  const [ic, col] = ACCION[fila.action] ?? ['check', 'text-ink-2'];
  return (
    <>
      <div className={`flex items-start gap-1.5 font-semibold ${col}`}>
        <span className="mt-[2px] inline-flex shrink-0">{hi(ic, { w: 14 })}</span>
        <span>{describir(fila, t)}</span>
      </div>
      {/* Una devolución sin su motivo no sirve de nada, y el motivo en columna propia
          dejaba las otras seis filas con un hueco. Va donde se lee. */}
      {fila.reason ? (
        <div className="mt-0.5 text-[12.5px] text-warn">
          {t.audit_reason}: «{fila.reason}»
        </div>
      ) : null}
      <Original fila={fila} t={t} />
    </>
  );
}

/**
 * El nombre lleva a su ficha.
 *
 * «Techportal (pruebas)» es una CUENTA, y hasta aquí era texto muerto: para saber quién
 * es ese que aprobó había que irse a Usuarios y buscarlo a mano. No hace falta un
 * enrutador nuevo — la aplicación navega con `go` y todas esas pantallas filtran por el
 * mismo buscador global, así que llevarlo puesto es el enlace.
 */
function Enlace({ texto, ruta, busca, nota = null, className = '' }: {
  texto: string;
  ruta: Route;
  busca: string;
  /** La nota EXACTA de la fila. El buscador solo acota al proyecto. */
  nota?: string | null;
  className?: string;
}) {
  const { patch, go } = useApp();
  return (
    <button
      type="button"
      onClick={() => {
        patch({ search: busca, selNote: nota });
        go(ruta);
      }}
      className={`text-left underline-offset-2 hover:underline hover:text-primary ${className}`}
    >
      {texto}
    </button>
  );
}

/**
 * A dónde lleva la columna SOBRE. `null` = a ningún sitio: el rastro apunta a algo que
 * ya no está, y un enlace a una ficha que no existe promete más de lo que puede dar.
 *
 * El nombre del proyecto es la primera mitad de la etiqueta que arma `audit.service.ts`
 * («proyecto · semana»); la bandeja busca por técnico y proyecto, no por fecha.
 */
const destino = (a: AuditRow): [Route, string] | null => {
  if (!a.entityLabel) return null;
  if (a.entity === 'weekly_note') return ['allnotes', a.entityLabel.split(' · ')[0]];
  if (a.entity === 'technician') return ['techs', a.entityLabel];
  return null;
};

/** La columna SOBRE: la ficha enlazada, o una raya si el rastro se quedó sin ella. */
function Sobre({ fila }: { fila: AuditRow }) {
  const d = destino(fila);
  if (!d) return fila.entityLabel ? <>{fila.entityLabel}</> : <span className="font-normal text-ink-3">—</span>;
  return (
    <Enlace
      texto={fila.entityLabel as string}
      ruta={d[0]}
      busca={d[1]}
      nota={fila.entity === 'weekly_note' ? fila.entityId : null}
    />
  );
}

/**
 * Los filtros. Van al SERVIDOR, no al array ya cargado: la pantalla se trae las últimas
 * 200 filas, así que filtrar aquí respondería «no hay devoluciones en julio» cuando la
 * verdad sería «julio no cabía en la página».
 *
 * ESCONDIDOS DETRÁS DE UN BOTÓN. Puestos en la cabecera ocupaban tres filas y le comían
 * media pantalla a lo que se viene a leer, que son las filas. Un filtro se usa de vez en
 * cuando; lo que tiene que estar siempre a la vista es si hay alguno puesto —el punto—
 * para que nadie lea una lista recortada creyéndola entera.
 *
 * `<details>` otra vez, como el registro original: sin estado, sin librería de popover.
 * Desplegable y dos `<input type="date">` nativos: un calendario propio serían tres
 * dependencias para lo que el navegador ya hace, y en el móvil lo hace mejor.
 *
 * Por ACCIÓN y por FECHA y nada más: por actor y por proyecto ya busca el buscador de
 * arriba, que filtra sobre lo mismo.
 */
function Filtros({
  accion,
  setAccion,
  desde,
  setDesde,
  hasta,
  setHasta,
  t,
}: {
  accion: string;
  setAccion: (v: string) => void;
  desde: string;
  setDesde: (v: string) => void;
  hasta: string;
  setHasta: (v: string) => void;
  t: Dict;
}) {
  const acciones: [string, string][] = [
    ['submit', t.aud_submit],
    ['approve', t.aud_approve],
    ['return', t.aud_return],
    ['reopen', t.aud_reopen],
    ['sign', t.aud_sign],
    ['update', t.aud_update],
    ['deactivate', t.aud_deactivate],
  ];
  const puesto = accion || desde || hasta;
  const campo = (etiqueta: string, control: ReactNode) => (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-semibold text-ink-3">{etiqueta}</span>
      {control}
    </label>
  );
  return (
    <details className="relative">
      <summary
        className={`${ghostBtn} list-none [&::-webkit-details-marker]:hidden`}
        aria-label={t.aud_filters}
      >
        {hi('funnel', { w: 14 })}
        {t.aud_filters}
        {/* Un punto y no un numero: lo que hay que saber de un vistazo es si la lista
            esta recortada, no por cuantas cosas. */}
        {puesto ? <span className="size-1.5 rounded-full bg-primary" /> : null}
      </summary>
      <div className="absolute right-0 top-full z-50 mt-1.5 flex w-[230px] flex-col gap-2.5 rounded-card border border-line bg-surface p-3 shadow-pop">
        {campo(
          t.col_action,
          <select value={accion} onChange={(e) => setAccion(e.target.value)} className={inputStyle}>
            <option value="">{t.aud_all_actions}</option>
            {acciones.map(([k, label]) => (
              <option key={k} value={k}>{label}</option>
            ))}
          </select>,
        )}
        {campo(
          t.date_from,
          <input
            type="date"
            value={desde}
            max={hasta || undefined}
            onChange={(e) => setDesde(e.target.value)}
            className={inputStyle}
          />,
        )}
        {campo(
          t.date_to,
          <input
            type="date"
            value={hasta}
            min={desde || undefined}
            onChange={(e) => setHasta(e.target.value)}
            className={inputStyle}
          />,
        )}
        {/* Solo cuando hay algo que quitar. `type="date"` no trae un borrado decente en
            todos los navegadores, y sin esto un filtro puesto por error se queda puesto. */}
        {puesto ? (
          <button
            type="button"
            className={ghostBtn}
            onClick={() => {
              setAccion('');
              setDesde('');
              setHasta('');
            }}
          >
            {t.aud_clear}
          </button>
        ) : null}
      </div>
    </details>
  );
}

/**
 * El input da 'YYYY-MM-DD' en el reloj del lector y el log guarda instantes UTC. La
 * conversión se hace aquí, que es el único sitio que sabe en qué huso está: «hasta el
 * 29» tiene que incluir el 29 entero, no cortarlo a medianoche de otro país.
 */
const desdeIso = (d: string) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const hastaIso = (d: string) => (d ? new Date(`${d}T23:59:59.999`).toISOString() : undefined);

export default function Audit() {
  const { state, t } = useApp();
  const movil = useIsMobile();
  const [accion, setAccion] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  // `data` conserva lo anterior mientras llega lo nuevo, así que cambiar un filtro no
  // parpadea a «Cargando…» ni se lleva por delante la barra.
  const { data, error } = useApiData(
    () => listAudit({ take: 200, action: accion, from: desdeIso(desde), to: hastaIso(hasta) }),
    [state.dataVersion, accion, desde, hasta],
  );
  const filtros = (
    <Filtros
      accion={accion}
      setAccion={setAccion}
      desde={desde}
      setDesde={setDesde}
      hasta={hasta}
      setHasta={setHasta}
      t={t}
    />
  );

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  // Se busca por la frase además de por la acción cruda: quien lee «Aprobó» y la
  // escribe en el buscador tiene que encontrar la fila que está viendo.
  const list = filterBy(
    data,
    state.search,
    (a: AuditRow) =>
      `${a.actorName} ${a.entity} ${a.entityLabel ?? ''} ${a.action} ${describir(a, t)} ${a.reason ?? ''}`,
  );

  if (!list.length) {
    return (
      <Card>
        <CardHead title={t.t_audit} right={filtros} />
        {/* Con un filtro puesto, «todavía no hay movimientos» sería falso: los hay,
            pero fuera de lo pedido. */}
        <div className="p-8 text-center text-[13px] text-ink-3">
          {accion || desde || hasta || state.search ? t.empty_list : t.audit_empty}
        </div>
      </Card>
    );
  }

  if (movil) {
    return (
      <Card>
        <CardHead title={t.t_audit} right={filtros} />
        <div className="p-3 flex flex-col gap-2.5">
          {list.map((a) => (
            <div key={a.id} className="border border-line rounded-card p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-bold">
                    <Enlace texto={a.actorName} ruta="users" busca={a.actorName} />
                  </div>
                  {a.entityLabel ? (
                    <div className="text-xs text-ink-3">
                      <Sobre fila={a} />
                    </div>
                  ) : null}
                </div>
                <span className="shrink-0 font-mono text-[11px] text-ink-3">{cuando(a.createdAt)}</span>
              </div>
              <div className="mt-2 text-[12.5px]">
                <Que fila={a} t={t} />
              </div>
            </div>
          ))}
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHead title={t.t_audit} right={filtros} />
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr>
              {[t.col_actor, t.col_action, t.col_entity, t.col_when].map((c, i) => (
                <th key={i} className={th}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {list.map((a) => (
              <tr key={a.id} className="border-t border-line align-top">
                <td className={`${td} font-semibold`}>
                  <Enlace texto={a.actorName} ruta="users" busca={a.actorName} />
                  {/* CAT-06: quién aprobó en nombre de quién. Es justo el caso que
                      alguien viene a mirar aquí meses después. */}
                  {a.onBehalfOfId ? (
                    <div className="text-[11px] text-ink-3">{t.audit_on_behalf}</div>
                  ) : null}
                </td>
                <td className={td}>
                  <Que fila={a} t={t} />
                </td>
                {/* De QUÉ nota (o de qué técnico) se habla. El TIPO de fila ya no se
                    pinta aquí: la frase de al lado dice «la nota» o «el técnico». */}
                <td className={`${td} font-semibold`}>
                  <Sobre fila={a} />
                </td>
                <td className={`${td} whitespace-nowrap font-mono text-xs text-ink-2`}>
                  {cuando(a.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
