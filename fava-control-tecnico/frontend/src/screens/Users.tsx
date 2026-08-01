import { useEffect, useState } from 'react';
import { svg, ICON, hi } from '../icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ApiState, filterBy, initials, inputStyle } from '../ui';
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
    <Card className="p-0 gap-0 overflow-hidden">
      <CardHeader className="border-b p-4">
        <CardTitle className="inline-flex items-center gap-2">
          {t.access_requests}
          {pending.length ? (
            <span className="bg-accent-brand text-white text-[10px] font-bold min-w-[18px] h-[18px] px-1.5 rounded-full grid place-items-center">
              {pending.length}
            </span>
          ) : null}
        </CardTitle>
      </CardHeader>
      {pending.length ? (
        <div>
          {pending.map((r, i) => (
            <div key={r.id} className={`flex items-center gap-3 p-row flex-wrap ${i ? 'border-t border-border' : ''}`}>
              <div className="size-8.5 rounded-full bg-muted grid place-items-center text-xs font-bold shrink-0">
                {initials(r.displayName || r.email)}
              </div>
              <div className="flex-1 min-w-[160px]">
                <div className="text-[13.5px] font-semibold">{r.displayName}</div>
                <div className="text-xs text-muted-foreground">{r.email}</div>
              </div>
              <div className="text-xs text-muted-foreground">
                {new Date(r.createdAt).toLocaleDateString(state.lang === 'es' ? 'es-ES' : 'it-IT')}
              </div>
              <Button variant="outline" size="sm" onClick={() => dismiss(r.id)} className="min-h-11 md:min-h-8">
                {t.access_requests_dismiss}
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <div className="p-row text-[13px] text-muted-foreground">{t.access_requests_empty}</div>
      )}
    </Card>
  );
}

export default function Users() {
  const { state, t, patch } = useApp();
  const [errLink, setErrLink] = useState<string | null>(null);
  // El color de cada rol es dato de dominio (T/A/S), no una paleta que Tailwind pueda
  // generar como clase: el naranja de A es el de MARCA (`accent-brand`), no el `accent`
  // de hover de shadcn — la misma colisión de nombres documentada en index.css.
  const rmap: Record<Role, [label: string, on: string, activo: string]> = {
    T: [t.role_t, 'border-sent bg-sent-tint text-sent', 'text-sent'],
    A: [t.role_a, 'border-accent-brand bg-accent-tint text-accent-brand', 'text-accent-brand'],
    S: [t.role_s, 'border-primary bg-primary-tint text-primary', 'text-primary'],
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
    <div className="flex flex-col gap-3.5">
      <div
        className={`flex gap-2.5 items-center border rounded-lg px-3.5 py-2.5 text-[12.5px] text-muted-foreground ${
          isSuper ? 'bg-primary-tint border-primary' : 'bg-warn-tint border-warn'
        }`}
      >
        {svg(ICON.shieldPlain, { w: 16 })}
        {t.only_super}
      </div>

      {state.role === 'A' || state.role === 'S' ? <AccessRequests /> : null}

      <Card className="p-0 gap-0 overflow-hidden">
        <CardHeader className="flex-row items-center justify-between border-b p-4">
          <CardTitle>{t.t_users}</CardTitle>
          <Button onClick={() => patch({ inviteOpen: true })} className="min-h-11 md:min-h-9">
            {hi('plus', { w: 15 })}
            {t.btn_invite}
          </Button>
        </CardHeader>
        {errLink ? <div className="px-4.5 py-2 text-xs text-warn">{t.err_save}: {errLink}</div> : null}
        <CardContent className="p-0">
          {rows.map((u, i) => (
            <div
              key={u.id}
              className={`flex items-center gap-3 p-row flex-wrap ${i ? 'border-t border-border' : ''} ${u.isActive ? '' : 'opacity-55'}`}
            >
              <div className="size-8.5 rounded-full bg-muted grid place-items-center text-xs font-bold shrink-0">
                {initials(u.displayName)}
              </div>
              <div className="flex-1 min-w-[160px]">
                <div className="text-[13.5px] font-semibold">{u.displayName}</div>
                <div className="text-xs text-muted-foreground">{u.email}</div>
              </div>

              {/* El vínculo con el maestro de técnicos: de esta columna sale la GUC
                  app.technician_id, que es lo que aísla la bitácora de la Fase 3. */}
              <div className="min-w-[190px]">
                <div className="text-[11px] text-muted-foreground mb-0.5">{t.user_tech_link}</div>
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

              <div className="flex gap-1.5 flex-wrap">
                {(['T', 'A', 'S'] as Role[]).map((rc) => {
                  const on = u.roles.includes(rc);
                  const [lbl, activo] = rmap[rc];
                  const locked = rc !== 'T' && !isSuper;
                  return (
                    <button
                      key={rc}
                      disabled={locked}
                      onClick={() => conmutarRol(u, rc)}
                      title={locked ? t.only_super : ''}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border transition-colors ${
                        locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                      } ${on ? activo : 'border-input text-muted-foreground'}`}
                    >
                      {on ? hi('check', { w: 13 }) : hi('plus', { w: 13 })}
                      <span className="ml-1">{lbl}</span>
                      {rc === 'A' && locked ? hi('lock', { w: 12 }) : null}
                    </button>
                  );
                })}
              </div>

              <Button variant="outline" size="sm" onClick={() => conmutarActivo(u)} className="min-h-11 md:min-h-9">
                {u.isActive ? t.cat_deactivate : t.cat_activate}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
