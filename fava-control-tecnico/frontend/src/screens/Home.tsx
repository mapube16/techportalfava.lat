import type { ReactNode } from 'react';
import { svg, ICON } from '../icons';
import { Card, CardHead, StatusPill } from '../ui';
import { useApp } from '../state';
import { useApiData } from '../lib/api/useApiData';
import { listNotes } from '../lib/api/weeklyNotes';

export default function Home() {
  const { state, t, go, patch } = useApp();
  const reg = 4, pend = 3;

  const quick = (icon: ReactNode, label: string, sub: string, on: () => void, accent: boolean) => (
    <button
      onClick={on}
      style={{ flex: 1, minWidth: 180, display: 'flex', alignItems: 'center', gap: 14, padding: 18, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', cursor: 'pointer', textAlign: 'left' }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 11, background: accent ? 'var(--accent-tint)' : 'var(--primary-tint)', color: accent ? 'var(--accent)' : 'var(--primary)', display: 'grid', placeItems: 'center', flex: 'none' }}>{icon}</div>
      <div>
        <div style={{ fontSize: 15, fontWeight: 700 }}>{label}</div>
        <div style={{ fontSize: 12.5, color: 'var(--text-2)' }}>{sub}</div>
      </div>
    </button>
  );

  // Las suyas y solo las suyas: lo garantiza la política `wn_read` de RLS en el motor,
  // no un filtro por nombre —que además se rompía en cuanto dos técnicos se llamaban
  // parecido, como Leomar y Leomir Klein—.
  const { data: mine } = useApiData(() => listNotes(), [state.dataVersion]);

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ background: 'linear-gradient(120deg,var(--primary-700),var(--primary))', color: '#fff', borderRadius: 'var(--radius)', padding: '22px 24px', boxShadow: 'var(--shadow)' }}>
        <div style={{ fontSize: 13, opacity: 0.8 }}>Hola, Ivan · {t.this_week}</div>
        <div style={{ display: 'flex', gap: 26, marginTop: 14, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 34, fontWeight: 700, fontFamily: 'Roboto Condensed' }}>{reg} / 7</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{t.day_registered}</div>
          </div>
          <div>
            <div style={{ fontSize: 34, fontWeight: 700, fontFamily: 'Roboto Condensed', color: '#ffd7b0' }}>{pend}</div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>{t.pending}</div>
          </div>
          <div style={{ flex: 1, minWidth: 200, alignSelf: 'center' }}>
            <div style={{ height: 8, background: 'rgba(255,255,255,.2)', borderRadius: 5, overflow: 'hidden' }}>
              <div style={{ width: (reg / 7) * 100 + '%', height: '100%', background: '#fff' }} />
            </div>
            <div style={{ fontSize: 11, opacity: 0.75, marginTop: 6 }}>Molino Cibao Bocel — RD · CTA1000 / PL6000</div>
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {quick(svg(ICON.cal, { w: 22 }), t.btn_logday, t.log_sub, () => patch({ logOpen: true }), true)}
        {quick(svg(ICON.doc, { w: 22 }), t.btn_myweek, t.week_of + ' 20 Jul', () => go('week'), false)}
      </div>
      <Card>
        <CardHead
          title={t.recent_notes}
          right={
            <button onClick={() => go('notes')} style={{ background: 'none', border: 0, color: 'var(--primary)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              {t.btn_open} →
            </button>
          }
        />
        <div>
          {(mine ?? []).map((n, i) => (
            <div key={n.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 'var(--row-pad)', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600 }}>{n.projectName}</div>
                <div style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'Roboto Mono' }}>{n.weekStart}</div>
              </div>
              {n.returnComment ? (
                <span style={{ fontSize: 11.5, color: 'var(--warn)', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>“{n.returnComment}”</span>
              ) : null}
              <StatusPill st={n.status as never} t={t} />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
