import type { CSSProperties } from 'react';
import { ConceptCode, btnGhostLight, pbtn } from '../ui';
import { FavaLogo } from '../icons';
import { useApp } from '../state';

const cellL: CSSProperties = { padding: '8px 10px', fontSize: 11, color: '#333', borderBottom: '1px solid #e2e2e2', verticalAlign: 'top' };

export default function PdfPreview() {
  const { state, t, patch, showToast } = useApp();
  const close = () => patch({ pdfOpen: false });
  const download = () => {
    close();
    showToast('submitted');
  };

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(8,16,24,.62)', zIndex: 65, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 22, overflowY: 'auto', animation: 'favaIn .2s ease' }}>
      <div style={{ display: 'flex', gap: 10, alignSelf: 'center', marginBottom: 16 }}>
        <button onClick={(e) => { e.stopPropagation(); download(); }} style={pbtn}>{t.pdf_download}</button>
        <button onClick={(e) => { e.stopPropagation(); close(); }} style={btnGhostLight}>{t.pdf_close}</button>
      </div>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 720, animation: 'favaIn .28s ease both' }}>
        <div style={{ background: '#fff', color: '#1a1a1a', width: '100%', boxShadow: '0 2px 10px rgba(0,0,0,.15)' }}>
          <div style={{ padding: '26px 30px', borderBottom: '3px solid #104A78', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <FavaLogo height={46} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#104A78' }}>{t.pdf_title}</div>
              <div style={{ fontSize: 11, color: '#666' }}>20–26 Jul 2026</div>
            </div>
          </div>
          <div style={{ padding: '18px 30px 8px', display: 'flex', gap: 30, fontSize: 11, color: '#555' }}>
            {[
              [t.col_tech, 'Ivan Cortés'],
              [t.client, 'Molino Cibao Bocel — RD'],
              [t.machines, 'CTA1000 · PL6000'],
            ].map(([a, b]) => (
              <div key={a}>
                <div style={{ color: '#999', textTransform: 'uppercase', letterSpacing: 0.5, fontSize: 9 }}>{a}</div>
                <div style={{ fontWeight: 600, color: '#222', fontSize: 12.5 }}>{b}</div>
              </div>
            ))}
          </div>
          <table style={{ width: 'calc(100% - 60px)', margin: '12px 30px', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Día', 'Concepto', 'Descripción del trabajo'].map((c, i) => (
                  <th key={i} style={{ textAlign: 'left', padding: '7px 10px', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: '#fff', background: '#104A78' }}>{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.week.map((d, i) => (
                <tr key={i}>
                  <td style={{ ...cellL, whiteSpace: 'nowrap', fontWeight: 600 }}>{t.days[i]} {20 + i}</td>
                  <td style={cellL}><ConceptCode code={d.concept} /></td>
                  <td style={{ ...cellL, color: '#444', lineHeight: 1.4 }}>{d.desc}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding: '6px 30px', display: 'flex', gap: 40, alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, color: '#999', marginBottom: 4 }}>{t.expenses}</div>
              {state.expenses.map((e, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '3px 0', borderBottom: '1px solid #eee', maxWidth: 260 }}>
                  <span style={{ color: '#444' }}>{e.desc}</span>
                  <span style={{ fontFamily: 'Roboto Mono', fontWeight: 600 }}>{e.val}</span>
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: 180, borderBottom: '1px solid #333', height: 44, marginBottom: 6, fontStyle: 'italic', color: '#104A78', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', fontSize: 16, fontFamily: '"Times New Roman",serif' }}>R. Peña</div>
              <div style={{ fontSize: 10, color: '#666' }}>{t.sign}</div>
              <div style={{ fontSize: 9.5, color: '#999' }}>Ing. Robert Peña · Cibao Industrial</div>
            </div>
          </div>
          <div style={{ padding: '12px 30px', marginTop: 8, borderTop: '1px solid #e2e2e2', fontSize: 9, color: '#aaa', display: 'flex', justifyContent: 'space-between' }}>
            <span>{t.pdf_note}</span>
            <span>OA-2451 · {new Date().toLocaleDateString('es-CL')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
