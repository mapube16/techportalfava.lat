import { useEffect, useRef, useState } from 'react';
import { FieldError, inputStyle } from '../ui';
import { useApp } from '../state';
import { codigo } from '../lib/api/useApiData';
import {
  deleteReceipt,
  listReceipts,
  receiptBlob,
  reducirImagen,
  uploadReceipt,
} from '../lib/api/weeklyNotes';
import type { Receipt } from '../lib/api/weeklyNotes';

/**
 * NOTA-08b — los comprobantes de un gasto.
 *
 * El MISMO bloque en los dos lados: el técnico lo usa para adjuntar la foto del ticket
 * y Andrea para mirarla antes de aprobar. Se distinguen por `soloLectura`, no por dos
 * componentes: la lista, la miniatura y el visor son idénticos, y duplicarlos sería
 * garantizar que uno se quede atrás.
 *
 * LAS MINIATURAS SE TRAEN CON `apiBlob` Y NO CON UN `<img src>` a la ruta. El endpoint
 * va con Bearer y una etiqueta `img` no manda cabeceras: saldría un 401 y la imagen
 * rota. Los objetos de URL se revocan al desmontar o la pestaña se queda con los bytes
 * de cada ticket que se haya mirado.
 */
export default function ReceiptsBlock({
  noteId,
  soloLectura = false,
}: {
  noteId: string;
  soloLectura?: boolean;
}) {
  const { t } = useApp();
  const [lista, setLista] = useState<Receipt[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  /**
   * Los objetos de URL creados, fuera del estado de React.
   *
   * Estuvieron en las dependencias del efecto y era un bug: al cargar una miniatura
   * cambiaba `urls`, el efecto se volvia a ejecutar y su LIMPIEZA revocaba las URL de
   * la pasada anterior — que son las que las <img> ya estaban usando. Resultado:
   * miniaturas rotas en cuanto llegaba la segunda. Aqui solo se revocan al desmontar.
   */
  const creadas = useRef<Record<string, string>>({});
  const [label, setLabel] = useState('');
  const [subiendo, setSubiendo] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    listReceipts(noteId)
      .then((r) => vivo && setLista(r))
      .catch((e: unknown) => vivo && setErr(codigo(e)));
    return () => {
      vivo = false;
    };
  }, [noteId]);

  // Se revocan al DESMONTAR, no en cada pasada del efecto de abajo.
  useEffect(
    () => () => {
      for (const u of Object.values(creadas.current)) if (u) URL.revokeObjectURL(u);
    },
    [],
  );

  // Una miniatura por comprobante. Son tres o cuatro por nota, así que no hace falta
  // paginar ni diferir.
  useEffect(() => {
    if (!lista) return;
    let vivo = true;
    for (const r of lista) {
      // La marca vacía reserva el hueco: sin ella, dos renders seguidos pedirían los
      // mismos bytes dos veces.
      if (r.id in creadas.current || r.mimeType === 'application/pdf') continue;
      creadas.current[r.id] = '';
      receiptBlob(noteId, r.id)
        .then((b) => {
          if (!vivo) return;
          const u = URL.createObjectURL(b);
          creadas.current[r.id] = u;
          setUrls((m) => ({ ...m, [r.id]: u }));
        })
        .catch(() => {
          // Una miniatura que no carga no debe tumbar el bloque; se libera la marca
          // para que un reintento posterior pueda volver a pedirla.
          delete creadas.current[r.id];
        });
    }
    return () => {
      vivo = false;
    };
  }, [lista, noteId]);

  const adjuntar = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    setSubiendo(true);
    try {
      const dataBase64 = await reducirImagen(file);
      const r = await uploadReceipt(noteId, {
        // Sin etiqueta se usa el nombre del archivo: obligar a escribir «botas» antes
        // de poder adjuntar es la clase de fricción por la que la gente no adjunta.
        label: label.trim() || file.name,
        mimeType: file.type === 'application/pdf' ? 'application/pdf' : 'image/jpeg',
        dataBase64,
      });
      setLista(r);
      setLabel('');
    } catch (e) {
      setErr(codigo(e));
    } finally {
      setSubiendo(false);
    }
  };

  const quitar = (id: string) => {
    setErr(null);
    deleteReceipt(noteId, id)
      .then(setLista)
      .catch((e: unknown) => setErr(codigo(e)));
  };

  const abrir = (r: Receipt) => {
    receiptBlob(noteId, r.id)
      .then((b) => {
        const u = URL.createObjectURL(b);
        window.open(u, '_blank');
        setTimeout(() => URL.revokeObjectURL(u), 60_000);
      })
      .catch((e: unknown) => setErr(codigo(e)));
  };

  return (
    <div className="mt-3.5">
      <div className="text-xs font-semibold text-muted-foreground mb-1.5">{t.receipts}</div>

      {lista?.length ? (
        <div className="flex flex-wrap gap-2.5 mb-2.5">
          {lista.map((r) => (
            <div key={r.id} className="border border-border rounded-lg overflow-hidden w-[132px]">
              <button
                type="button"
                onClick={() => abrir(r)}
                aria-label={r.label}
                className="block w-full h-[86px] bg-muted cursor-pointer"
              >
                {urls[r.id] ? (
                  <img src={urls[r.id]} alt={r.label} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[11px] text-muted-foreground">PDF</span>
                )}
              </button>
              <div className="px-2 py-1.5">
                <div className="text-[11.5px] font-semibold truncate">{r.label}</div>
                <div className="text-[10.5px] text-muted-foreground">
                  {Math.round(r.sizeBytes / 1024)} KB
                </div>
                {soloLectura ? null : (
                  <button
                    type="button"
                    onClick={() => quitar(r.id)}
                    className="text-[11px] text-warn font-semibold cursor-pointer bg-transparent border-0 p-0 mt-0.5"
                  >
                    {t.order_delete}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[12.5px] text-muted-foreground mb-2.5">{t.receipt_none}</div>
      )}

      {soloLectura ? null : (
        <div className="flex gap-2 flex-wrap items-center">
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={t.receipt_label_ph}
            aria-label={t.receipt_label}
            className={`${inputStyle} flex-1 min-w-[150px]`}
          />
          {/* `capture` no se pone a proposito: en el movil el selector ofrece camara Y
              galeria, y el tecnico muchas veces ya tiene la foto hecha del dia anterior. */}
          <label className="inline-flex items-center justify-center min-h-11 md:min-h-9 px-4 rounded-md border border-border bg-muted text-[13px] font-semibold cursor-pointer hover:bg-surface-3">
            {subiendo ? '…' : t.receipt_add}
            <input
              type="file"
              accept="image/*,application/pdf"
              className="sr-only"
              disabled={subiendo}
              onChange={(e) => {
                void adjuntar(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
        </div>
      )}

      {err ? <FieldError msg={`${t.err_save}: ${err}`} /> : null}
    </div>
  );
}
