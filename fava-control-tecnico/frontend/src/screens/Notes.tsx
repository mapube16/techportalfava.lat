import { svg, ICON, hi } from '../icons';
import { Card, Empty, StatusPill, gbtn, pbtn } from '../ui';
import { useApp } from '../state';
import { CURRENT_TECH } from '../data';

export default function Notes() {
  const { state, t, go, patch, resend } = useApp();
  const mine = state.notes.filter((n) => n.tech === CURRENT_TECH);

  if (!mine.length) {
    return <Empty icon={svg(ICON.doc, { w: 30 })} msg={t.empty_notes} btn={t.btn_logday} onClick={() => patch({ logOpen: true })} />;
  }

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>
      {mine.map((n) => (
        <Card key={n.id}>
          <div style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ flex: 1, minWidth: 200 }}>
                <div style={{ fontSize: 14.5, fontWeight: 700 }}>{n.project}</div>
                <div style={{ fontSize: 12.5, color: 'var(--text-3)' }}>
                  {n.week} · {n.days} {t.col_days.toLowerCase()}
                </div>
              </div>
              <StatusPill st={n.status} t={t} />
              <button onClick={() => go('week')} style={gbtn}>{t.btn_open}</button>
              {n.status === 'returned' ? (
                <button onClick={() => resend(n.id)} style={pbtn}>
                  {hi('up', { w: 15 })}
                  {t.resend}
                </button>
              ) : null}
            </div>
            {n.comment ? (
              <div style={{ marginTop: 12, display: 'flex', gap: 10, background: 'var(--warn-tint)', border: '1px solid var(--warn)', borderRadius: 9, padding: '10px 12px' }}>
                <div style={{ color: 'var(--warn)', flex: 'none' }}>{svg(ICON.triangle, { w: 17 })}</div>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--warn)' }}>{t.returned_note} · Giulia Rossi</div>
                  <div style={{ fontSize: 12.5, color: 'var(--text-2)', marginTop: 2 }}>{n.comment}</div>
                </div>
              </div>
            ) : null}
          </div>
        </Card>
      ))}
    </div>
  );
}
