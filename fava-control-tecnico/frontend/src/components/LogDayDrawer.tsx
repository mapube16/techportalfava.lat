import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { hi } from '../icons';
import { CONCEPTS } from '../i18n';
import { FieldError, gbtn, pbtn } from '../ui';
import { useApp } from '../state';
import { LOG_PROJECTS, MACHINES } from '../data';

const inp: CSSProperties = { width: '100%', padding: '12px 13px', border: '1px solid var(--border-2)', borderRadius: 10, background: 'var(--surface-2)', color: 'var(--text)', fontSize: 15, fontFamily: 'inherit', outline: 'none' };
const errInp: CSSProperties = { ...inp, border: '1px solid var(--warn)', background: 'var(--warn-tint)' };

export default function LogDayDrawer() {
  const { state, t, patch, showToast } = useApp();
  const [concept, setConcept] = useState('DC');
  const [machine, setMachine] = useState(MACHINES[0]);
  const [desc, setDesc] = useState('');
  const [descError, setDescError] = useState(false);

  const close = () => patch({ logOpen: false });
  const save = () => {
    if (!desc.trim()) {
      setDescError(true);
      return;
    }
    close();
    showToast('saved');
  };

  const field = (label: string, el: ReactNode, err?: boolean) => (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>{label}</label>
      {el}
      {err ? <FieldError msg={t.field_req} /> : null}
    </div>
  );

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(8,16,24,.5)', zIndex: 60, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', animation: 'favaIn .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'var(--surface)', borderRadius: '20px 20px 0 0', boxShadow: 'var(--shadow-lg)', maxHeight: '92vh', overflowY: 'auto', animation: 'favaIn .28s ease both' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 3, background: 'var(--border-2)' }} />
        </div>
        <div style={{ padding: '6px 22px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{t.log_title}</div>
              <div style={{ fontSize: 12, color: 'var(--warn)', fontWeight: 600 }}>● {t.log_sub}</div>
            </div>
            <button onClick={close} style={{ ...gbtn, padding: '8px 10px' }}>{hi('x', { w: 15 })}</button>
          </div>
          {field(t.log_date, <input type="date" defaultValue="2026-07-23" style={inp} />)}
          {field(
            t.log_project,
            <select defaultValue="p2" style={inp}>
              {LOG_PROJECTS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>,
          )}
          {field(
            t.log_machine,
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {MACHINES.map((m) => {
                const on = machine === m;
                return (
                  <button
                    key={m}
                    onClick={() => setMachine(m)}
                    style={{ flex: 1, padding: 11, border: '1px solid ' + (on ? 'var(--primary)' : 'var(--border-2)'), background: on ? 'var(--primary-tint)' : 'var(--surface-2)', color: on ? 'var(--primary)' : 'var(--text-2)', borderRadius: 10, fontWeight: 600, fontSize: 14, cursor: 'pointer', fontFamily: 'Roboto Mono' }}
                  >
                    {m}
                  </button>
                );
              })}
            </div>,
          )}
          {field(
            t.log_concept,
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
              {CONCEPTS.map((c) => {
                const on = concept === c.c;
                return (
                  <button
                    key={c.c}
                    onClick={() => setConcept(c.c)}
                    title={c[state.lang]}
                    style={{ padding: '10px 4px', border: '1px solid ' + (on ? c.color : 'var(--border-2)'), background: on ? c.color : 'var(--surface-2)', color: on ? '#fff' : 'var(--text-2)', borderRadius: 9, fontWeight: 700, fontSize: 13, cursor: 'pointer', fontFamily: 'Roboto Mono' }}
                  >
                    {c.c}
                  </button>
                );
              })}
            </div>,
          )}
          <div style={{ fontSize: 11.5, color: 'var(--text-3)', margin: '-6px 0 14px' }}>
            {(CONCEPTS.find((c) => c.c === concept) || CONCEPTS[0])[state.lang]}
          </div>
          {field(
            t.log_desc,
            <textarea
              value={desc}
              onChange={(e) => {
                setDesc(e.target.value);
                if (descError && e.target.value.trim()) setDescError(false);
              }}
              placeholder={t.log_desc_ph}
              style={{ ...(descError ? errInp : inp), minHeight: 96, resize: 'vertical' }}
            />,
            descError,
          )}
          <button onClick={save} style={{ ...pbtn, width: '100%', padding: 14, fontSize: 15, justifyContent: 'center' }}>{t.btn_saveday}</button>
        </div>
      </div>
    </div>
  );
}
