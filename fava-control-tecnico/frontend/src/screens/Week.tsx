import { useState } from 'react';
import { hi } from '../icons';
import { Card, CardHead, ConceptPill, StatusPill, gbtn, pbtn, sbtn } from '../ui';
import { useApp } from '../state';
import SignatureBox from '../components/SignatureBox';

export default function Week() {
  const { state, t, go, patch, showToast } = useApp();
  const [hasSignature, setHasSignature] = useState(false);
  const [clearToken, setClearToken] = useState(0);

  const clearSign = () => {
    setClearToken((v) => v + 1);
    setHasSignature(false);
  };

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Card>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)', flexWrap: 'wrap', gap: 8 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>Molino Cibao Bocel — RD</div>
            <div style={{ fontSize: 12, color: 'var(--text-3)' }}>{t.week_of} 20–26 Jul 2026 · CTA1000</div>
          </div>
          <StatusPill st="draft" t={t} />
        </div>
        <div>
          {state.week.map((d, i) => (
            <div key={i} style={{ display: 'flex', gap: 14, padding: 'var(--row-pad)', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'flex-start' }}>
              <div style={{ width: 44, flex: 'none' }}>
                <div style={{ fontSize: 11, color: 'var(--text-3)', fontWeight: 600 }}>{t.days[i]}</div>
                <div style={{ fontSize: 16, fontWeight: 700, fontFamily: 'Roboto Condensed' }}>{20 + i}</div>
              </div>
              <div style={{ flex: 'none', width: 150 }}>
                <ConceptPill code={d.concept} lang={state.lang} />
              </div>
              <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{d.desc}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead
          title={t.expenses}
          right={
            <button onClick={() => showToast('saved')} style={sbtn}>
              {hi('plus', { w: 14 })}
              {t.btn_addexp}
            </button>
          }
        />
        <div>
          {state.expenses.map((e, i) => (
            <div key={i} style={{ display: 'flex', gap: 12, padding: 'var(--row-pad)', borderTop: i ? '1px solid var(--border)' : 'none', alignItems: 'center' }}>
              <div style={{ flex: 1, fontSize: 13.5 }}>{e.desc}</div>
              <div style={{ fontSize: 12.5, color: 'var(--text-3)', width: 70 }}>{e.date}</div>
              <div style={{ fontSize: 13.5, fontWeight: 600, fontFamily: 'Roboto Mono' }}>{e.val}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <CardHead title={t.sign} />
        <div style={{ padding: 18 }}>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--text-2)' }}>{t.sign_hint}</p>
          <div style={{ position: 'relative', border: '2px dashed var(--border-2)', borderRadius: 10, background: 'var(--surface-2)', height: 160, overflow: 'hidden' }}>
            <SignatureBox onSigned={() => setHasSignature(true)} clearToken={clearToken} />
            {!hasSignature ? (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', color: 'var(--text-3)', fontSize: 13 }}>
                {hi('pencil', { w: 17 })}
                {t.sign_here}
              </div>
            ) : null}
            <div style={{ position: 'absolute', bottom: 10, left: 0, right: 40, height: 1, background: 'var(--border-2)', margin: '0 24px', pointerEvents: 'none' }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10 }}>
            <div style={{ fontSize: 11.5, color: 'var(--text-3)' }}>
              {hasSignature ? t.sign_captured + ' · Ing. Robert Peña, Cibao Industrial' : '—'}
            </div>
            <button onClick={clearSign} style={gbtn}>{t.btn_clear}</button>
          </div>
        </div>
      </Card>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'flex-end', alignItems: 'center' }}>
        <div style={{ flex: 1, fontSize: 12, color: 'var(--text-3)', minWidth: 200 }}>{t.gen_pdf_note}</div>
        <button onClick={() => patch({ pdfOpen: true })} style={gbtn}>
          {hi('eye', { w: 15 })}
          {t.btn_pdf}
        </button>
        <button
          onClick={() => {
            showToast('submitted');
            go('notes');
          }}
          style={pbtn}
        >
          {t.btn_submit} →
        </button>
      </div>
    </div>
  );
}
