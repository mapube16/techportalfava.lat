import { useState } from 'react';
import { hi } from '../icons';
import { FieldError, gbtn, wbtn } from '../ui';
import { useApp } from '../state';
import { codigo } from '../lib/api/useApiData';
import { returnNote } from '../lib/api/weeklyNotes';

/**
 * NOTA-03 — devolver exige comentario.
 *
 * El boton se deshabilita sin texto, pero eso es cortesia: quien manda es el servidor,
 * y por debajo un CHECK del motor impide que una nota quede en `returned` sin comentario
 * aunque el servicio se equivoque.
 */
export default function ReturnModal() {
  const { state, t, patch, showToast, refresh } = useApp();
  const [comment, setComment] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  const close = () => patch({ returnOpen: false, returnId: null, returnUpdatedAt: null });

  const devolver = () => {
    if (!state.returnId || !comment.trim()) return;
    setErr(null);
    setEnviando(true);
    // El `updatedAt` que se leyo al abrir: si otro admin la movio mientras se escribia
    // el comentario, el servidor responde 409 en vez de pisar su decision.
    returnNote(state.returnId, comment.trim(), state.returnUpdatedAt ?? '')
      .then(() => {
        close();
        refresh();
        showToast('saved');
      })
      .catch((e: unknown) => setErr(codigo(e)))
      .finally(() => setEnviando(false));
  };

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
          style={{ width: '100%', minHeight: 96, resize: 'vertical', border: '1px solid var(--border-2)', borderRadius: 10, padding: 12, fontFamily: 'inherit', fontSize: 'max(15px, var(--fs-input))', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none' }}
        />
        {err ? <FieldError msg={`${t.err_save}: ${err}`} /> : null}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
          <button onClick={close} className={`${gbtn} min-h-11`}>{t.btn_cancel}</button>
          <button
            onClick={devolver}
            disabled={!comment.trim() || enviando}
            className={`${wbtn} min-h-11 ${comment.trim() && !enviando ? '' : 'opacity-50'}`}
          >
            {t.btn_return}
          </button>
        </div>
      </div>
    </div>
  );
}
