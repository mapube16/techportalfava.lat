import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FieldError, inputStyle } from '../ui';
import { useApp } from '../state';
import { codigo } from '../lib/api/useApiData';
import { reducirImagen } from '../lib/api/weeklyNotes';
import {
  addExpense,
  deleteExpense,
  expenseFileUrl,
  getExpenses,
  type DailyExpense,
} from '../lib/api/dailyEntries';

/**
 * GASTO-01 — los gastos del DÍA, dentro del cajón de la jornada.
 *
 * Iván Cortés, en la capacitación del 2026-08-31: «¿no sería más útil tenerlo en el
 * diario? a veces uno efectuó el gasto de una vez, tiene la factura». Andrea aceptó en
 * el momento. Antes solo se podían escribir al ENVIAR la nota: el viernes, de memoria y
 * con el ticket ya perdido.
 *
 * El comprobante es OPCIONAL a propósito: en obra se anota «peaje 15.000» en diez
 * segundos y la foto se sube al llegar al hotel. Exigir la foto para poder anotar el
 * gasto es la forma segura de que no se anote ninguno.
 *
 * Se guarda AL INSTANTE, no con «Guardar jornada»: el gasto cuelga de la jornada ya
 * escrita y su propio endpoint lo valida. Por eso el bloque solo aparece cuando el día
 * ya existe — un gasto sin día no tiene dónde colgarse.
 */
export default function DayExpenses({ fecha, bloqueado }: { fecha: string; bloqueado: boolean }) {
  const { t, errTexto } = useApp();
  const [lista, setLista] = useState<DailyExpense[] | null>(null);
  const [descripcion, setDescripcion] = useState('');
  const [valor, setValor] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vigente = true;
    getExpenses(fecha)
      .then((g) => vigente && setLista(g))
      .catch(() => vigente && setLista([]));
    return () => {
      vigente = false;
    };
  }, [fecha]);

  const anadir = async () => {
    if (!descripcion.trim() || !valor.trim()) return;
    setErr(null);
    setGuardando(true);
    try {
      // La foto de un móvil son 3-8 MB; `reducirImagen` la baja a ~300 KB antes de
      // subirla, igual que en los comprobantes de la nota. Un PDF va tal cual.
      const conFoto = archivo
        ? archivo.type === 'application/pdf'
          ? { mimeType: 'application/pdf', dataBase64: await leerBase64(archivo) }
          : { mimeType: 'image/jpeg', dataBase64: await reducirImagen(archivo) }
        : {};
      const creado = await addExpense(fecha, {
        descripcion: descripcion.trim(),
        valor: valor.trim(),
        ...conFoto,
      });
      setLista((l) => [...(l ?? []), creado]);
      setDescripcion('');
      setValor('');
      setArchivo(null);
    } catch (e: unknown) {
      setErr(codigo(e));
    } finally {
      setGuardando(false);
    }
  };

  const quitar = (id: string) => {
    setErr(null);
    deleteExpense(fecha, id)
      .then(() => setLista((l) => (l ?? []).filter((g) => g.id !== id)))
      .catch((e: unknown) => setErr(codigo(e)));
  };

  if (lista === null) return null;

  return (
    <div className="mb-3.5">
      <span className="block text-[12.5px] font-semibold text-muted-foreground mb-1.5">
        {t.exp_day_title}
      </span>

      {lista.length ? (
        <div className="flex flex-col gap-1.5 mb-2">
          {lista.map((g) => (
            <div
              key={g.id}
              className="flex items-center gap-2 rounded-lg border border-input bg-muted px-3 py-2 text-[13px]"
            >
              <span className="flex-1 min-w-0 truncate">{g.descripcion}</span>
              <span className="font-mono font-semibold shrink-0">{g.valor}</span>
              {g.mimeType ? (
                <a
                  href={expenseFileUrl(fecha, g.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="text-[11.5px] text-primary underline shrink-0"
                >
                  {t.exp_day_see}
                </a>
              ) : (
                <span className="text-[11.5px] text-muted-foreground shrink-0">
                  {t.exp_day_nofile}
                </span>
              )}
              {bloqueado ? null : (
                <button
                  type="button"
                  onClick={() => quitar(g.id)}
                  aria-label={t.btn_cancel}
                  className="text-muted-foreground hover:text-warn cursor-pointer shrink-0"
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      ) : null}

      {bloqueado ? (
        lista.length ? null : (
          <div className="text-[12.5px] text-muted-foreground">{t.exp_day_none}</div>
        )
      ) : (
        <>
          <div className="flex gap-2 flex-wrap">
            <input
              value={descripcion}
              onChange={(e) => setDescripcion(e.target.value)}
              placeholder={t.exp_day_ph}
              maxLength={120}
              className={`${inputStyle} flex-[2_1_150px]`}
            />
            <input
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder={t.exp_day_val_ph}
              maxLength={40}
              className={`${inputStyle} flex-[1_1_90px] font-mono`}
            />
          </div>
          <div className="flex gap-2 items-center flex-wrap mt-2">
            <input
              type="file"
              accept="image/jpeg,image/png,application/pdf"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              className="text-[12px] flex-1 min-w-[140px]"
            />
            <Button
              onClick={anadir}
              disabled={guardando || !descripcion.trim() || !valor.trim()}
              variant="outline"
              className="min-h-11 md:min-h-9 shrink-0"
            >
              {guardando ? t.loading : t.btn_addexp}
            </Button>
          </div>
        </>
      )}

      {err ? <FieldError msg={errTexto(err)} /> : null}
    </div>
  );
}

/** Un PDF no se puede recomprimir en el navegador: va tal cual, en base64. */
function leerBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('lectura'));
    lector.onload = () => resolve(String(lector.result).split(',')[1] ?? '');
    lector.readAsDataURL(file);
  });
}
