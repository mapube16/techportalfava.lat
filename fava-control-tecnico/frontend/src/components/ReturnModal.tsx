import { useState } from 'react';
import { hi } from '../icons';
import { gbtn, wbtn } from '../ui';
import { useApp } from '../state';

export default function ReturnModal() {
  const { state, t, patch, returnNote } = useApp();
  const [comment, setComment] = useState('');
  const close = () => patch({ returnOpen: false, returnId: null });

  return (
    <div onClick={close} style={{ position: 'fixed', inset: 0, background: 'rgba(8,16,24,.5)', zIndex: 60, display: 'grid', placeItems: 'center', padding: 20, animation: 'favaIn .2s ease' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 440, background: 'var(--surface)', borderRadius: 16, boxShadow: 'var(--shadow-lg)', padding: 22, animation: 'favaIn .26s ease both' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--warn-tint)', color: 'var(--warn)', display: 'grid', placeItems: 'center', flex: 'none' }}>
            {hi('ureturn', { w: 17 })}
          </div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{t.return_title}</div>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', margin: '0 0 14px' }}>{t.return_sub}</p>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t.return_ph}
          style={{ width: '100%', minHeight: 96, resize: 'vertical', border: '1px solid var(--border-2)', borderRadius: 10, padding: 12, fontFamily: 'inherit', fontSize: 14, background: 'var(--surface-2)', color: 'var(--text)', outline: 'none' }}
        />
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={close} style={gbtn}>{t.btn_cancel}</button>
          <button onClick={() => state.returnId && returnNote(state.returnId, comment)} style={wbtn}>{t.btn_return}</button>
        </div>
      </div>
    </div>
  );
}
