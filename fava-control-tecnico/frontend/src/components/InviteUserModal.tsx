import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hi } from '../icons';
import { FieldError, inputError, inputStyle } from '../ui';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import { inviteUser } from '../lib/api/users';
import { activos } from '../lib/api/catalogs';
import { listTechnicians } from '../lib/api/technicians';
import type { Role } from '../types';

export default function InviteUserModal() {
  const { state, t, patch, refresh, showToast } = useApp();
  const [name, setName] = useState('');
  const [mail, setMail] = useState('');
  const [roles, setRoles] = useState<Role[]>(['T']);
  const [techId, setTechId] = useState('');
  const [errors, setErrors] = useState<{ name?: boolean; mail?: boolean; mailFmt?: boolean }>({});
  const [errApi, setErrApi] = useState<string | null>(null);
  const isSuper = state.role === 'S';

  // Vincular al invitar ahorra el segundo paso desde la pantalla de Usuarios; el
  // servidor aplica la misma validación que el PATCH del vínculo.
  const { data: techs } = useApiData(listTechnicians, []);

  // El color de cada rol es dato de dominio, no una paleta que Tailwind pueda generar
  // como clase: el naranja de A es el de MARCA (`accent-brand`), no el `accent` de
  // hover de shadcn — la colisión de nombres documentada en index.css.
  const rmap: Record<Role, [label: string, on: string]> = {
    T: [t.role_t, 'border-sent bg-sent-tint text-sent'],
    A: [t.role_a, 'border-accent-brand bg-accent-tint text-accent-brand'],
    S: [t.role_s, 'border-primary bg-primary-tint text-primary'],
  };

  const close = () => patch({ inviteOpen: false });
  const toggleRole = (rc: Role) => {
    if (rc === 'T') return; // el rol Técnico siempre queda activo
    setRoles((rs) => (rs.includes(rc) ? rs.filter((x) => x !== rc) : [...rs, rc]));
  };

  const create = () => {
    const errs: { name?: boolean; mail?: boolean; mailFmt?: boolean } = {};
    if (!name.trim()) errs.name = true;
    if (!mail.trim()) errs.mail = true;
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(mail.trim())) errs.mailFmt = true;
    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }
    setErrApi(null);
    // No manda correo (V1X-01, diferido): crea la fila que el primer login reclama.
    inviteUser({
      email: mail.trim(),
      displayName: name.trim(),
      roles: roles.slice(),
      technicianId: techId || null,
    })
      .then(() => {
        patch({ inviteOpen: false });
        refresh();
        showToast('invite');
      })
      .catch((e: unknown) => setErrApi(codigo(e)));
  };

  return (
    <div onClick={close} className="fixed inset-0 z-60 bg-black/50 grid place-items-center p-5 fava-anim">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[460px] bg-card rounded-2xl shadow-pop max-h-[92vh] overflow-y-auto fava-anim"
      >
        <div className="flex items-start justify-between px-5.5 pt-5 pb-1">
          <div>
            <div className="text-lg font-bold">{t.invite_title}</div>
            <div className="text-[12.5px] text-muted-foreground mt-0.5 max-w-[320px]">{t.invite_sub}</div>
          </div>
          <Button variant="outline" size="icon" onClick={close} className="size-11 md:size-9">
            <X className="size-4" />
          </Button>
        </div>

        <div className="px-5.5 pb-5.5 pt-3.5 flex flex-col gap-3.5">
          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{t.invite_name}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t.invite_name_ph}
              className={errors.name ? inputError : inputStyle}
            />
            {errors.name ? <FieldError msg={t.field_req} /> : null}
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{t.invite_email}</label>
            <input
              value={mail}
              onChange={(e) => setMail(e.target.value)}
              placeholder={t.invite_email_ph}
              className={errors.mail || errors.mailFmt ? inputError : inputStyle}
            />
            {errors.mail ? <FieldError msg={t.field_req} /> : errors.mailFmt ? <FieldError msg={t.email_invalid} /> : null}
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{t.invite_roles}</label>
            <div className="flex gap-2 flex-wrap">
              {(['T', 'A', 'S'] as Role[]).map((rc) => {
                const on = roles.includes(rc);
                const [lbl, activo] = rmap[rc];
                const locked = rc !== 'T' && !isSuper;
                return (
                  <button
                    key={rc}
                    disabled={locked}
                    title={locked ? t.only_super : ''}
                    onClick={() => toggleRole(rc)}
                    className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-[13px] font-semibold border transition-colors ${
                      locked ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                    } ${on ? activo : 'border-input text-muted-foreground'}`}
                  >
                    {on ? hi('check', { w: 13 }) : hi('plus', { w: 13 })}
                    <span className="ml-0.5">{lbl}</span>
                    {locked ? hi('lock', { w: 12 }) : null}
                  </button>
                );
              })}
            </div>
            {isSuper ? null : <div className="text-[11.5px] text-muted-foreground mt-1.5">{t.only_super}</div>}
          </div>

          <div>
            <label className="block text-xs font-semibold text-muted-foreground mb-1.5">{t.invite_tech}</label>
            <select value={techId} onChange={(e) => setTechId(e.target.value)} className={inputStyle}>
              <option value="">{t.user_no_link}</option>
              {activos(techs ?? []).map((tc) => (
                <option key={tc.id} value={tc.id}>{tc.fullName}</option>
              ))}
            </select>
          </div>

          {errApi ? <FieldError msg={`${t.err_save}: ${errApi}`} /> : null}

          <div className="flex gap-2.5 justify-end mt-1">
            <Button variant="outline" onClick={close} className="min-h-11 md:min-h-9">
              {t.btn_cancel}
            </Button>
            <Button onClick={create} className="min-h-11 md:min-h-9">
              {hi('up', { w: 15 })}
              {t.btn_invite}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
