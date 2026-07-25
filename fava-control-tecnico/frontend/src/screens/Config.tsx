import { Dots } from '../icons';
import { Card, CardHead, chip } from '../ui';
import { CONCEPTS } from '../i18n';
import { CURRENCIES } from '../data';
import { useApp } from '../state';

export default function Config() {
  const { state, t } = useApp();
  const rows: [string, string][] = [
    [t.density, state.density === 'compact' ? t.compact : t.comfortable],
    [t.lang_row, t.lang_label],
    [t.theme_row, state.theme === 'dark' ? t.theme_dark : t.theme_light],
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: state.mobile ? '1fr' : '1fr 1fr', gap: 16, maxWidth: 900 }}>
      <Card>
        <CardHead title={t.config_concepts} />
        <div style={{ padding: '8px 18px' }}>
          {CONCEPTS.map((c, i) => (
            <div key={c.c} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? '1px solid var(--border)' : 'none' }}>
              <span style={{ fontFamily: 'Roboto Mono', fontSize: 12, fontWeight: 600, color: '#fff', background: c.color, padding: '3px 7px', borderRadius: 5, minWidth: 44, textAlign: 'center' }}>{c.c}</span>
              <span style={{ flex: 1, fontSize: 13.5 }}>{c[state.lang]}</span>
              <span style={{ color: 'var(--text-3)', display: 'inline-flex' }}><Dots w={16} /></span>
            </div>
          ))}
        </div>
      </Card>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Card>
          <CardHead title={t.config_currency} />
          <div style={{ padding: '12px 18px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {CURRENCIES.map((c) => (
              <span key={c} style={chip()}>{c}</span>
            ))}
          </div>
        </Card>
        <Card>
          <CardHead title={t.config_general} />
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {rows.map((r) => (
              <div key={r[0]} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5 }}>
                <span style={{ color: 'var(--text-2)' }}>{r[0]}</span>
                <b>{r[1]}</b>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
