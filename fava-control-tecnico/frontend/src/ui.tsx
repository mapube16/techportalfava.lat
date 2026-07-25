import type { CSSProperties, ReactNode } from 'react';
import { CONCEPTS } from './i18n';
import type { Dict } from './i18n';
import type { Lang, NoteStatus } from './types';

// ---- estilos compartidos de botones / tablas / chips
export const pbtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'var(--primary)', color: '#fff', border: 0, borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
export const gbtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', background: 'var(--surface-2)', color: 'var(--text)', border: '1px solid var(--border-2)', borderRadius: 9, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
export const wbtn: CSSProperties = { ...pbtn, background: 'var(--warn)' };
export const sbtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: 'var(--accent-tint)', color: 'var(--accent)', border: 0, borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
export const ghostBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', padding: '7px 11px', background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 12.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
export const ghostIconBtn: CSSProperties = { display: 'inline-grid', placeItems: 'center', width: 34, height: 34, background: 'var(--surface-2)', color: 'var(--text-2)', border: '1px solid var(--border)', borderRadius: 8, cursor: 'pointer' };
export const btnGhostLight: CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 6, padding: '9px 16px', background: 'rgba(255,255,255,.14)', color: '#fff', border: '1px solid rgba(255,255,255,.35)', borderRadius: 9, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };

export const th: CSSProperties = { textAlign: 'left', padding: '11px 16px', fontSize: 11, fontWeight: 700, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '.5px', background: 'var(--surface-2)', whiteSpace: 'nowrap' };
export const td: CSSProperties = { padding: 'var(--row-pad)', color: 'var(--text)', verticalAlign: 'middle' };

export const chip = (bg?: string, c?: string): CSSProperties => ({ display: 'inline-block', padding: '3px 9px', borderRadius: 6, fontSize: 11.5, fontWeight: 600, fontFamily: 'Roboto Mono', background: bg || 'var(--surface-3)', color: c || 'var(--text-2)' });

export const inputStyle: CSSProperties = { width: '100%', padding: '11px 12px', border: '1px solid var(--border-2)', borderRadius: 9, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit', outline: 'none' };
export const inputError: CSSProperties = { ...inputStyle, border: '1px solid var(--warn)', background: 'var(--warn-tint)' };

// ---- contenedores
export function Card({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', ...style }}>
      {children}
    </div>
  );
}

export function CardHead({ title, right }: { title: ReactNode; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
      {right || null}
    </div>
  );
}

// ---- pills
export function StatusPill({ st, t }: { st: NoteStatus; t: Dict }) {
  const map: Record<NoteStatus, [string, string]> = {
    draft: ['--draft', '--draft-tint'],
    sent: ['--sent', '--sent-tint'],
    approved: ['--ok', '--ok-tint'],
    returned: ['--warn', '--warn-tint'],
  };
  const [c, bg] = map[st];
  const lbl = { draft: t.st_draft, sent: t.st_sent, approved: t.st_approved, returned: t.st_returned }[st];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 600, color: `var(${c})`, background: `var(${bg})` }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: `var(${c})` }} />
      {lbl}
    </span>
  );
}

export function ConceptPill({ code, lang }: { code: string; lang: Lang }) {
  const cc = CONCEPTS.find((x) => x.c === code) || CONCEPTS[0];
  return (
    <span title={cc[lang]} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
      <span style={{ fontFamily: 'Roboto Mono,monospace', fontSize: 11, fontWeight: 600, color: '#fff', background: cc.color, padding: '2px 6px', borderRadius: 5 }}>{code}</span>
      <span style={{ color: 'var(--text-2)', fontWeight: 400 }}>{cc[lang]}</span>
    </span>
  );
}

export function ConceptCode({ code }: { code: string }) {
  const cc = CONCEPTS.find((x) => x.c === code) || CONCEPTS[0];
  return (
    <span style={{ fontFamily: 'Roboto Mono', fontSize: 9.5, fontWeight: 700, color: '#fff', background: cc.color, padding: '2px 6px', borderRadius: 4 }}>{code}</span>
  );
}

// ---- estado vacío
export function Empty({ icon, msg, btn, onClick }: { icon: ReactNode; msg: string; btn?: string; onClick?: () => void }) {
  return (
    <div style={{ display: 'grid', placeItems: 'center', minHeight: '50vh' }}>
      <div style={{ textAlign: 'center', maxWidth: 340 }}>
        <div style={{ width: 64, height: 64, borderRadius: 16, background: 'var(--surface-3)', color: 'var(--text-3)', display: 'grid', placeItems: 'center', margin: '0 auto 16px' }}>{icon}</div>
        <p style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>{msg}</p>
        {btn ? (
          <button onClick={onClick} style={{ ...pbtn, marginTop: 8 }}>
            {btn}
          </button>
        ) : null}
      </div>
    </div>
  );
}

export function FieldError({ msg }: { msg: string }) {
  return (
    <div style={{ fontSize: 11.5, color: 'var(--warn)', marginTop: 5, display: 'flex', alignItems: 'center', gap: 4 }}>
      <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
      </svg>
      {msg}
    </div>
  );
}

export const filterBy = <T,>(list: T[], q: string, keyFn: (it: T) => string): T[] => {
  const query = (q || '').trim().toLowerCase();
  if (!query) return list;
  return list.filter((it) => keyFn(it).toLowerCase().includes(query));
};
