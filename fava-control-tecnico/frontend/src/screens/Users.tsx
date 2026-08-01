import { useEffect, useState } from 'react';
import { svg, ICON, hi } from '../icons';
import { ApiState, Card, CardHead, filterBy, gbtn, initials, inputStyle, pbtn } from '../ui';
import { useApp } from '../state';
import { dismissAccessRequest, listAccessRequests } from '../lib/api/client';
import type { AccessRequest } from '../lib/api/client';
import { codigo, useApiData } from '../lib/api/useApiData';
import { linkTechnician, listUsers, setUserActive, setUserRoles } from '../lib/api/users';
import type { UserRow } from '../lib/api/users';
import { listTechnicians } from '../lib/api/technicians';
import type { Role } from '../types';

// Solicitudes creadas desde la pantalla «sin acceso», vía GET/PATCH /api/access-requests.
// El feed de notificaciones in-app es Fase 7 (RT-02): aquí solo aterrizan en la lista.
function AccessRequests() {
  const { state, t } = useApp();
  const [reqs, setReqs] = useState<AccessRequest[] | null>(null);

  useEffect(() => {
    let alive = true;
    listAccessRequests()
      .then((r) => alive && setReqs(r))
      .catch(() => alive && setReqs([]));
    return () => {
      alive = false;
    };
  }, []);

  const pending = (reqs || []).filter((r) => r.status === 'pending');

  const dismiss = (id: string) => {
    setReqs((rs) => (rs || []).filter((r) => r.id !== id)); // optimista
    dismissAccessRequest(id).catch(() => listAccessRequests().then(setReqs).catch(() => {}));
  };

  if (!reqs) return null;

  return (
    <Card>
      <CardHead
        title={
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            {t.access_requests}
            {pending.length ? (
              <span style={{ background: 'var(--accent)', color: '#fff', fontSize: 10, fontWeight: 700, minWidth: 18, height: 18, padding: '0 5px', borderRadius: 9, display: 'grid', placeItems: 'center' }}>
                {pending.length}
              </span>
            ) : null}
          </span>
        }
      />
      {pending.length ? (
        <div>
          {pending.map((r, i) => (
            <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--row-pad)', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap' }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{initials(r.displayName || r.email)}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{r.displayName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{r.email}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {new Date(r.createdAt).toLocaleDateString(state.lang === 'es' ? 'es-ES' : 'it-IT')}
              </div>
              <button onClick={() => dismiss(r.id)} className={gbtn}>{t.access_requests_dismiss}</button>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ padding: 'var(--row-pad)', fontSize: 13, color: 'var(--text-3)' }}>{t.access_requests_empty}</div>
      )}
    </Card>
  );
}

export default function Users() {
  const { state, t, patch } = useApp();
  const [errLink, setErrLink] = useState<string | null>(null);
  const rmap: Record<Role, [string, string, string]> = {
    T: [t.role_t, 'var(--sent)', 'var(--sent-tint)'],
    A: [t.role_a, 'var(--accent)', 'var(--accent-tint)'],
    S: [t.role_s, 'var(--primary)', 'var(--primary-tint)'],
  };
  const isSuper = state.role === 'S';

  // Usuarios y técnicos: el selector del vínculo necesita las dos listas.
  const { data, setData, error } = useApiData(async () => {
    const [users, techs] = await Promise.all([listUsers(), listTechnicians()]);
    return { users, techs };
  }, [state.dataVersion]);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  const rows = filterBy(data.users, state.search, (u) => u.displayName + ' ' + u.email);

  /**
   * El vínculo es 1-a-1 por motor: si el técnico ya está tomado el servidor responde
   * 409 y hay que desvincular al otro usuario primero. El código se muestra tal cual
   * porque nombra exactamente eso.
   */
  const aplicar = (peticion: Promise<UserRow>, id: string) => {
    setErrLink(null);
    peticion
      .then((actualizado) => setData({ ...data, users: data.users.map((x) => (x.id === id ? actualizado : x)) }))
      .catch((e: unknown) => setErrLink(codigo(e)));
  };

  const vincular = (u: UserRow, technicianId: string | null) =>
    aplicar(linkTechnician(u.id, technicianId), u.id);

  /**
   * Las dos reglas duras viven en el servidor y aquí NO se reimplementan: solo un
   * Super Admin concede o quita A/S, y los dos anti-lockout impiden quedarse sin
   * Super Admin. Si el servidor dice que no, se muestra su código.
   */
  const conmutarRol = (u: UserRow, rc: Role) =>
    aplicar(setUserRoles(u.id, u.roles.includes(rc) ? u.roles.filter((r) => r !== rc) : [...u.roles, rc]), u.id);

  const conmutarActivo = (u: UserRow) => aplicar(setUserActive(u.id, !u.isActive), u.id);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', background: isSuper ? 'var(--primary-tint)' : 'var(--warn-tint)', border: '1px solid ' + (isSuper ? 'var(--primary)' : 'var(--warn)'), borderRadius: 10, padding: '10px 14px', fontSize: 12.5, color: 'var(--text-2)' }}>
        {svg(ICON.shieldPlain, { w: 16 })}
        {t.only_super}
      </div>
      {state.role === 'A' || state.role === 'S' ? <AccessRequests /> : null}
      <Card>
        <CardHead
          title={t.t_users}
          right={
            <button onClick={() => patch({ inviteOpen: true })} className={pbtn}>
              {hi('plus', { w: 15 })}
              {t.btn_invite}
            </button>
          }
        />
        {errLink ? <div style={{ padding: '8px 18px', fontSize: 12, color: 'var(--warn)' }}>{t.err_save}: {errLink}</div> : null}
        <div>
          {rows.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--row-pad)', borderTop: i ? '1px solid var(--border)' : 'none', flexWrap: 'wrap', opacity: u.isActive ? 1 : 0.55 }}>
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--surface-3)', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{initials(u.displayName)}</div>
              <div style={{ flex: 1, minWidth: 160 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{u.displayName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{u.email}</div>
              </div>
              {/* El vínculo con el maestro de técnicos: de esta columna sale la GUC
                  app.technician_id, que es lo que aísla la bitácora de la Fase 3. */}
              <div style={{ minWidth: 190 }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 3 }}>{t.user_tech_link}</div>
                <select
                  value={u.technicianId ?? ''}
                  onChange={(e) => vincular(u, e.target.value || null)}
                  className={`${inputStyle} px-2 py-1.5 text-[13px]`}
                >
                  <option value="">{t.user_no_link}</option>
                  {data.techs
                    .filter((tc) => tc.isActive || tc.id === u.technicianId)
                    .map((tc) => (
                      <option key={tc.id} value={tc.id}>{tc.fullName}</option>
                    ))}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {(['T', 'A', 'S'] as Role[]).map((rc) => {
                  const on = u.roles.includes(rc);
                  const [lbl, c, bg] = rmap[rc];
                  const locked = rc !== 'T' && !isSuper;
                  return (
                    <button
                      key={rc}
                      disabled={locked}
                      onClick={() => conmutarRol(u, rc)}
                      title={locked ? t.only_super : ''}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: locked ? 'not-allowed' : 'pointer', border: '1px solid ' + (on ? c : 'var(--border-2)'), background: on ? bg : 'transparent', color: on ? c : 'var(--text-3)', opacity: locked ? 0.5 : 1 }}
                    >
                      {on ? hi('check', { w: 13 }) : hi('plus', { w: 13 })}
                      <span style={{ marginLeft: 4 }}>{lbl}</span>
                      {rc === 'A' && locked ? hi('lock', { w: 12 }) : null}
                    </button>
                  );
                })}
              </div>
              <button onClick={() => conmutarActivo(u)} className={gbtn}>
                {u.isActive ? t.cat_deactivate : t.cat_activate}
              </button>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
