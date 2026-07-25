import { useState } from 'react';
import { hi } from '../icons';
import { FieldError, gbtn, inputError, inputStyle, pbtn } from '../ui';
import { useApp } from '../state';
import type { Role } from '../types';

export default function InviteUserModal() {
  const { state, t, patch, addUser } = useApp();
  const [name, setName] = useState('');
  const [mail, setMail] = useState('');
  const [roles, setRoles] = useState<Role[]>(['T']);
  const [errors, setErrors] = useState<{ name?: boolean; mail?: boolean; mailFmt?: boolean }>({});
  const isSuper = state.role === 'S';

  const rmap: Record<Role, [string, string, string]> = {
    T: [t.role_t, 'var(--sent)', 'var(--sent-tint)'],
    A: [t.role_a, 'var(--accent)', 'var(--accent-tint)'],
    S: [t.role_s, 'var(--primary)', 'var(--primary-tint)'],
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
    addUser({ n: name.trim(), mail: mail.trim(), roles: roles.slice() });
  };

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(8,16,24,.5)', zIndex: 60, display: 'grid', placeItems: 'center', padding: 20, animation: 'favaIn .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 460, background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', maxHeight: '92vh', overflowY: 'auto', animation: 'favaIn .26s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '20px 22px 4px' }}>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{t.invite_title}</div>
            <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 3, maxWidth: 320 }}>{t.invite_sub}</div>
          </div>
          <button onClick={close} style={{ ...gbtn, padding: '8px 10px' }}>{hi('x', { w: 15 })}</button>
        </div>
        <div style={{ padding: '14px 22px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>{t.invite_name}</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t.invite_name_ph} style={errors.name ? inputError : inputStyle} />
            {errors.name ? <FieldError msg={t.field_req} /> : null}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>{t.invite_email}</label>
            <input value={mail} onChange={(e) => setMail(e.target.value)} placeholder={t.invite_email_ph} style={errors.mail || errors.mailFmt ? inputError : inputStyle} />
            {errors.mail ? <FieldError msg={t.field_req} /> : errors.mailFmt ? <FieldError msg={t.email_invalid} /> : null}
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>{t.invite_roles}</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {(['T', 'A', 'S'] as Role[]).map((rc) => {
                const on = roles.includes(rc);
                const [lbl, c, bg] = rmap[rc];
                const locked = rc !== 'T' && !isSuper;
                return (
                  <button
                    key={rc}
                    disabled={locked}
                    title={locked ? t.only_super : ''}
                    onClick={() => toggleRole(rc)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 13px', borderRadius: 20, fontSize: 13, fontWeight: 600, cursor: locked ? 'not-allowed' : 'pointer', border: '1px solid ' + (on ? c : 'var(--border-2)'), background: on ? bg : 'transparent', color: on ? c : 'var(--text-3)', opacity: locked ? 0.5 : 1 }}
                  >
                    {on ? hi('check', { w: 13 }) : hi('plus', { w: 13 })}
                    <span style={{ marginLeft: 2 }}>{lbl}</span>
                    {locked ? hi('lock', { w: 12 }) : null}
                  </button>
                );
              })}
            </div>
            {isSuper ? null : <div style={{ fontSize: 11.5, color: 'var(--text-3)', marginTop: 6 }}>{t.only_super}</div>}
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
            <button onClick={close} style={gbtn}>{t.btn_cancel}</button>
            <button onClick={create} style={pbtn}>
              {hi('up', { w: 15 })}
              {t.btn_invite}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
