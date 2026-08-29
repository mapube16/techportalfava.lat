import { useState } from 'react';
import { hi } from '../icons';
import { Button } from '@/components/ui/button';
import { FieldError } from '../ui';
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
  const { state, t, patch, showToast, refresh, errTexto } = useApp();
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
    <div onClick={close} className="fixed inset-0 z-60 bg-black/50 grid place-items-center p-5 fava-anim">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] bg-card rounded-2xl shadow-pop p-5.5 fava-anim"
      >
        <div className="flex items-center gap-2.5 mb-1.5">
          <div className="size-8 rounded-lg bg-warn-tint text-warn grid place-items-center shrink-0">
            {hi('ureturn', { w: 17 })}
          </div>
          <div className="text-base font-bold">{t.return_title}</div>
        </div>
        <p className="text-[13px] text-muted-foreground mb-3.5">{t.return_sub}</p>
        {/* 16px en móvil: por debajo, Safari hace zoom al enfocar y descuadra el modal. */}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder={t.return_ph}
          className="w-full min-h-24 resize-y border border-input rounded-lg p-3 font-sans text-base md:text-sm bg-muted text-foreground outline-none focus:border-primary"
        />
        {err ? <FieldError msg={errTexto(err)} /> : null}
        <div className="flex gap-2.5 justify-end mt-4">
          <Button variant="outline" onClick={close} className="min-h-11 md:min-h-9">
            {t.btn_cancel}
          </Button>
          <Button
            variant="destructive"
            onClick={devolver}
            disabled={!comment.trim() || enviando}
            className="min-h-11 md:min-h-9"
          >
            {t.btn_return}
          </Button>
        </div>
      </div>
    </div>
  );
}
