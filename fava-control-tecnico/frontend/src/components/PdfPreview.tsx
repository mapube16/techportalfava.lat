import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { btnGhostLight } from '../ui';
import { useApp } from '../state';
import { codigo } from '../lib/api/useApiData';
import { downloadNotePdf, previewNotePdf } from '../lib/api/weeklyNotes';

/**
 * Vista previa del PDF REAL: lo renderiza el servidor con `nota-pdf.ts` (el mismo
 * generador que congela el PDF firmado) y aquí solo se muestra en un `<iframe>`.
 *
 * Antes esto era una maqueta en HTML que imitaba el papel con `state.week`/`state.expenses`
 * inventados. Mantenerla habría sido peor que no tenerla: dos maquetas del mismo documento
 * que se separan en cuanto una de las dos cambia, y la que el cliente firma es la otra.
 *
 * `firmado` decide de dónde salen los bytes: si la nota ya tiene firma se piden los
 * CONGELADOS (los mismos que firmó el cliente, byte a byte); si no, se renderiza el
 * borrador al vuelo.
 */
export default function PdfPreview({ noteId, firmado }: { noteId: string; firmado: boolean }) {
  const { t, patch } = useApp();
  const [url, setUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const close = () => patch({ pdfOpen: false });

  useEffect(() => {
    let vivo = true;
    let objectUrl: string | null = null;
    (firmado ? downloadNotePdf(noteId) : previewNotePdf(noteId))
      .then((blob) => {
        if (!vivo) return;
        objectUrl = URL.createObjectURL(blob);
        setUrl(objectUrl);
      })
      .catch((e: unknown) => vivo && setErr(codigo(e)));
    return () => {
      vivo = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [noteId, firmado]);

  return (
    <div onClick={close} className="fixed inset-0 z-65 bg-black/60 flex flex-col items-center p-5.5 overflow-y-auto fava-anim">
      <div className="flex gap-2.5 self-center mb-4">
        <Button
          onClick={(e) => { e.stopPropagation(); if (url) window.open(url, '_blank'); }}
          disabled={!url}
          className="min-h-11 md:min-h-9"
        >
          {t.pdf_download}
        </Button>
        <button onClick={(e) => { e.stopPropagation(); close(); }} className={btnGhostLight}>
          {t.pdf_close}
        </button>
      </div>

      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[820px] fava-anim">
        {err ? (
          <div className="bg-card rounded-xl p-8 text-center text-[13px] text-warn">
            {t.pdf_error}: {err}
          </div>
        ) : url ? (
          // A4 en proporción: el iframe usa el visor nativo del navegador, que ya sabe
          // paginar y hacer zoom — reimplementar eso no aporta nada al documento.
          <iframe src={url} title={t.pdf_title} className="w-full h-[80vh] bg-white rounded-lg border-0" />
        ) : (
          <div className="bg-card rounded-xl p-8 text-center text-[13px] text-muted-foreground">{t.pdf_loading}</div>
        )}
      </div>
    </div>
  );
}
