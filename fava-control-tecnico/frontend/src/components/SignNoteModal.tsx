import { useRef, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { hi } from '../icons';
import { FieldError, inputError, inputStyle } from '../ui';
import { useApp } from '../state';
import ReceiptsBlock from './ReceiptsBlock';
import { codigo } from '../lib/api/useApiData';
import SignatureBox from './SignatureBox';
import type { SignatureHandle } from './SignatureBox';
import { setNoteExpenses, signNote } from '../lib/api/weeklyNotes';
import type { Gasto, WeeklyNote } from '../lib/api/weeklyNotes';

/**
 * NOTA-04/05/08 — firmar la nota.
 *
 * Firma POR NOTA y no por semana: una nota es de UN proyecto, y si el técnico trabajó
 * en dos obras la misma semana salen dos notas con dos clientes distintos. Un cliente
 * no puede firmar el trabajo del otro.
 *
 * Las dos firmas se mandan JUNTAS porque el servidor renderiza el PDF una sola vez con
 * ambas casillas estampadas y lo congela: no existe una nota «firmada a medias».
 *
 * Los gastos se guardan ANTES de firmar, en su propia petición: son un recurso aparte
 * (`PUT /expenses`) y el servidor los bloquea en cuanto la nota tiene firma, así que
 * este es literalmente el último momento en que se pueden escribir.
 */

/** Una firma en curso: los datos del firmante y su lienzo. */
interface Firmante {
  nombre: string;
  documento: string;
  cargo: string;
}

const FIRMANTE_VACIO: Firmante = { nombre: '', documento: '', cargo: '' };

/** Cuatro filas fijas, como las tablas del PDF. Las vacías no se mandan. */
const CUATRO = [0, 1, 2, 3];

export default function SignNoteModal({ nota, onClose }: { nota: WeeklyNote; onClose: () => void }) {
  const { t, showToast, refresh } = useApp();
  const [tecnico, setTecnico] = useState<Firmante>({ ...FIRMANTE_VACIO, nombre: nota.technicianName });
  const [cliente, setCliente] = useState<Firmante>(FIRMANTE_VACIO);
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [anticipos, setAnticipos] = useState<Gasto[]>([]);
  const [acepta, setAcepta] = useState(false);
  const [hayTrazoT, setHayTrazoT] = useState(false);
  const [hayTrazoC, setHayTrazoC] = useState(false);
  const [limpiarT, setLimpiarT] = useState(0);
  const [limpiarC, setLimpiarC] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [firmando, setFirmando] = useState(false);

  const refT = useRef<SignatureHandle>(null);
  const refC = useRef<SignatureHandle>(null);

  const listo = tecnico.nombre.trim() && cliente.nombre.trim() && hayTrazoT && hayTrazoC && acepta;

  const firmar = () => {
    const pngT = refT.current?.toPng();
    const pngC = refC.current?.toPng();
    if (!pngT || !pngC) {
      setErr(t.sign_missing);
      return;
    }
    setErr(null);
    setFirmando(true);

    // Sin líneas que guardar no se llama al endpoint: una petición que no cambia nada
    // solo añade un modo de fallo entre el usuario y su firma.
    const limpias = (xs: Gasto[]) => xs.filter((g) => g.descripcion.trim() && g.valor.trim());
    const gs = limpias(gastos);
    const as = limpias(anticipos);
    const previo = gs.length || as.length ? setNoteExpenses(nota.id, gs, as) : Promise.resolve(null);

    previo
      .then(() =>
        signNote(
          nota.id,
          { signerName: tecnico.nombre.trim(), signerDocument: tecnico.documento.trim() || undefined, signerRole: tecnico.cargo.trim() || undefined, declarationAccepted: true, imagePng: pngT },
          { signerName: cliente.nombre.trim(), signerDocument: cliente.documento.trim() || undefined, signerRole: cliente.cargo.trim() || undefined, declarationAccepted: true, imagePng: pngC },
          nota.updatedAt,
        ),
      )
      .then(() => {
        onClose();
        refresh();
        showToast('signed');
      })
      .catch((e: unknown) => setErr(codigo(e)))
      .finally(() => setFirmando(false));
  };

  const campo = (label: string, valor: string, set: (s: string) => void, ph: string, error?: boolean) => (
    <label className="block">
      {/* La etiqueta ENVUELVE al control: asociacion implicita, sin inventar ids.
          Como hermana no nombraba nada — un lector de pantalla anunciaba el campo
          sin nombre y pulsar el texto no enfocaba. */}
      <span className="block text-xs font-semibold text-muted-foreground mb-1.5">{label}</span>
      <input value={valor} onChange={(e) => set(e.target.value)} placeholder={ph} className={error ? inputError : inputStyle} />
    </label>
  );

  /** Un bloque de firma: los datos del firmante, el lienzo y el botón de limpiar. */
  const bloque = (
    titulo: string,
    f: Firmante,
    set: (fn: (v: Firmante) => Firmante) => void,
    hayTrazo: boolean,
    limpiar: () => void,
    token: number,
    marcar: () => void,
    handle: React.RefObject<SignatureHandle | null>,
  ) => (
    <div className="border border-border rounded-xl p-3.5 flex flex-col gap-3">
      <div className="text-[13px] font-bold">{titulo}</div>
      {campo(t.sign_name, f.nombre, (v) => set((x) => ({ ...x, nombre: v })), t.sign_name_ph)}
      <div className="grid grid-cols-2 gap-3">
        {campo(t.sign_document, f.documento, (v) => set((x) => ({ ...x, documento: v })), t.sign_document_ph)}
        {campo(t.sign_role, f.cargo, (v) => set((x) => ({ ...x, cargo: v })), t.sign_role_ph)}
      </div>
      <div className="relative border-2 border-dashed border-input rounded-lg bg-muted h-32 overflow-hidden">
        <SignatureBox ref={handle} onSigned={marcar} clearToken={token} />
        {!hayTrazo ? (
          <div className="absolute inset-0 flex gap-2 items-center justify-center pointer-events-none text-muted-foreground text-[13px]">
            {hi('pencil', { w: 17 })}
            {t.sign_here}
          </div>
        ) : null}
      </div>
      <div className="flex justify-between items-center">
        <div className="text-[11.5px] text-muted-foreground">{hayTrazo ? t.sign_captured : '—'}</div>
        <Button variant="outline" size="sm" onClick={limpiar} className="min-h-11 md:min-h-8">
          {t.btn_clear}
        </Button>
      </div>
    </div>
  );

  /** Las 4 filas de una tabla de gastos. Fijas, como las imprime el PDF. */
  const tablaGastos = (titulo: string, filas: Gasto[], set: (xs: Gasto[]) => void) => (
    <div>
      <div className="text-xs font-semibold text-muted-foreground mb-1.5">{titulo}</div>
      <div className="flex flex-col gap-2">
        {CUATRO.map((i) => (
          <div key={i} className="grid grid-cols-[1fr_110px] gap-2">
            <input
              value={filas[i]?.descripcion ?? ''}
              onChange={(e) => {
                const xs = CUATRO.map((k) => filas[k] ?? { descripcion: '', valor: '' });
                xs[i] = { ...xs[i], descripcion: e.target.value };
                set(xs);
              }}
              placeholder={t.exp_desc}
              className={inputStyle}
            />
            <input
              value={filas[i]?.valor ?? ''}
              onChange={(e) => {
                const xs = CUATRO.map((k) => filas[k] ?? { descripcion: '', valor: '' });
                xs[i] = { ...xs[i], valor: e.target.value };
                set(xs);
              }}
              placeholder={t.exp_val}
              className={`${inputStyle} font-mono`}
            />
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <div onClick={onClose} className="fixed inset-0 z-60 bg-black/50 grid place-items-center p-5 fava-anim">
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[620px] bg-card rounded-2xl shadow-pop max-h-[92vh] overflow-y-auto fava-anim"
      >
        <div className="flex items-start justify-between px-5.5 pt-5 pb-1">
          <div>
            <div className="text-lg font-bold">{t.sign_modal_title}</div>
            <div className="text-[12.5px] text-muted-foreground mt-0.5 max-w-[420px]">{t.sign_modal_sub}</div>
          </div>
          <Button variant="outline" size="icon" onClick={onClose} aria-label={t.pdf_close} className="size-11 md:size-9">
            <X className="size-4" />
          </Button>
        </div>

        <div className="px-5.5 pb-5.5 pt-3.5 flex flex-col gap-4">
          <div className="text-[12.5px] text-muted-foreground">
            <span className="font-semibold text-foreground">{nota.projectName}</span> · {nota.clientName} · {nota.weekStart}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {tablaGastos(t.expenses, gastos, setGastos)}
            {tablaGastos(t.advances, anticipos, setAnticipos)}
            {/* La foto del ticket, junto a su importe: se aprueban a la vez que la
                semana, con el mismo boton. */}
            <ReceiptsBlock noteId={nota.id} />
          </div>

          {bloque(t.sign_technician, tecnico, setTecnico, hayTrazoT, () => { setLimpiarT((v) => v + 1); setHayTrazoT(false); }, limpiarT, () => setHayTrazoT(true), refT)}
          {bloque(t.sign, cliente, setCliente, hayTrazoC, () => { setLimpiarC((v) => v + 1); setHayTrazoC(false); }, limpiarC, () => setHayTrazoC(true), refC)}

          {/* La aceptación EXPLÍCITA de la declaración: sin esto el trazo es un dibujo,
              y el servidor la exige (CHECK del motor incluido). */}
          <label className="flex gap-2.5 items-start cursor-pointer bg-muted border border-border rounded-xl p-3.5">
            <input type="checkbox" checked={acepta} onChange={(e) => setAcepta(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-primary" />
            <div>
              <div className="text-[12.5px] font-semibold">{t.sign_declaration}</div>
              <div className="text-[11.5px] text-muted-foreground mt-0.5">{t.sign_declaration_accept}</div>
            </div>
          </label>

          {err ? <FieldError msg={`${t.err_save}: ${err}`} /> : null}

          <div className="flex gap-2.5 justify-end">
            <Button variant="outline" onClick={onClose} className="min-h-11 md:min-h-9">
              {t.btn_cancel}
            </Button>
            <Button onClick={firmar} disabled={!listo || firmando} className="min-h-11 md:min-h-9">
              {firmando ? t.btn_signing : t.btn_signnote}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
