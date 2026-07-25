import { useState } from 'react';
import { hi } from '../icons';
import { Card, ConceptPill, StatusPill, filterBy, pbtn, wbtn } from '../ui';
import { useApp } from '../state';

export default function Inbox() {
  const { state, t, patch, approve } = useApp();
  const [selNote, setSelNote] = useState<string | null>(null);
  const q = filterBy(state.notes.filter((n) => n.status === 'sent'), state.search, (n) => n.tech + ' ' + n.project);
  const cur = q.find((n) => n.id === selNote) || q[0];

  const list = (
    <div style={{ width: 340, flex: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
      {q.length ? (
        q.map((n) => {
          const sel = cur?.id === n.id;
          return (
            <button
              key={n.id}
              onClick={() => setSelNote(n.id)}
              style={{ textAlign: 'left', background: sel ? 'var(--primary-tint)' : 'var(--surface)', border: '1px solid ' + (sel ? 'var(--primary)' : 'var(--border)'), borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: '13px 15px', cursor: 'pointer', display: 'flex', gap: 11, alignItems: 'center' }}
            >
              <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--primary-700)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, flex: 'none' }}>{n.ini}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{n.tech}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.project}</div>
                <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{n.week}</div>
              </div>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--sent)', flex: 'none' }} />
            </button>
          );
        })
      ) : (
        <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-3)', fontSize: 13, border: '1px dashed var(--border-2)', borderRadius: 10 }}>
          <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', justifyContent: 'center' }}>
            {hi('check', { w: 15 })}
            {t.inbox_empty}
          </span>
        </div>
      )}
    </div>
  );

  const detail = cur ? (
    <Card>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap' }}>
        <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--primary-700)', color: '#fff', display: 'grid', placeItems: 'center', fontWeight: 700 }}>{cur.ini}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>{cur.tech}</div>
          <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>{cur.project} · {cur.week}</div>
        </div>
        <StatusPill st="sent" t={t} />
      </div>
      <div style={{ padding: '8px 18px' }}>
        {state.week.slice(0, 7).map((d, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, padding: '9px 0', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
            <div style={{ width: 38, fontSize: 11, color: 'var(--text-3)', fontWeight: 600, flex: 'none' }}>{t.days[i]} {20 + i}</div>
            <div style={{ width: 140, flex: 'none' }}>
              <ConceptPill code={d.concept} lang={state.lang} />
            </div>
            <div style={{ flex: 1, fontSize: 12.5, color: 'var(--text-2)', lineHeight: 1.45 }}>{d.desc}</div>
          </div>
        ))}
      </div>
      <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 20, fontSize: 12.5, color: 'var(--text-2)' }}>
        <div>
          <b style={{ color: 'var(--text)' }}>{cur.expenses}</b> {t.expenses.toLowerCase()}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
          {hi('pencil', { w: 14 })}
          {t.sign_captured}
        </div>
      </div>
      <div style={{ display: 'flex', gap: 10, padding: '14px 18px', borderTop: '1px solid var(--border)', justifyContent: 'flex-end' }}>
        <button onClick={() => patch({ returnOpen: true, returnId: cur.id })} style={wbtn}>
          {hi('ureturn', { w: 15 })}
          {t.btn_return}
        </button>
        <button
          onClick={() => {
            approve(cur.id);
            setSelNote(null);
          }}
          style={{ ...pbtn, background: 'var(--ok)' }}
        >
          {hi('check', { w: 16 })}
          {t.btn_approve}
        </button>
      </div>
    </Card>
  ) : (
    <Card>
      <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>{t.inbox_empty}</div>
    </Card>
  );

  return (
    <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
      {list}
      <div style={{ flex: 1, minWidth: 0 }}>{detail}</div>
    </div>
  );
}
