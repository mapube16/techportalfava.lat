import { hi } from '../icons';
import { useApp } from '../state';

const COLOR: Record<string, string> = { approved: 'var(--ok)', returned: 'var(--warn)', saved: 'var(--accent)', submitted: 'var(--sent)', invite: 'var(--sent)', proj: 'var(--primary)' };
const TINT: Record<string, string> = { approved: 'var(--ok-tint)', returned: 'var(--warn-tint)', saved: 'var(--accent-tint)', submitted: 'var(--sent-tint)', invite: 'var(--sent-tint)', proj: 'var(--primary-tint)' };
const ICON_NAME: Record<string, string> = { approved: 'check', returned: 'ureturn', saved: 'check', submitted: 'up', invite: 'up', proj: 'plus' };

export default function Toast() {
  const { state } = useApp();
  const toast = state.toast;
  if (!toast) return null;
  const color = COLOR[toast.kind] || 'var(--primary)';
  const tint = TINT[toast.kind] || 'var(--primary-tint)';
  const icon = ICON_NAME[toast.kind] || 'check';

  return (
    <div style={{ position: 'fixed', bottom: 22, right: 22, zIndex: 80, display: 'flex', alignItems: 'center', gap: 12, background: 'var(--surface)', border: '1px solid var(--border)', borderLeft: '4px solid ' + color, borderRadius: 11, boxShadow: 'var(--shadow-lg)', padding: '13px 16px', minWidth: 280, maxWidth: 380, animation: 'favaToast .3s ease both' }}>
      <div style={{ width: 26, height: 26, borderRadius: 7, background: tint, color, display: 'grid', placeItems: 'center', flex: 'none' }}>{hi(icon, { w: 15 })}</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{toast.title}</div>
        <div style={{ fontSize: 12, color: 'var(--text-2)' }}>{toast.body}</div>
      </div>
    </div>
  );
}
