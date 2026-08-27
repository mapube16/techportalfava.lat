import { useState } from 'react';
import { svg, ICON, hi } from '../icons';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ApiState, Empty, StatusPill } from '../ui';
import { useApp } from '../state';
import { codigo, useApiData } from '../lib/api/useApiData';
import SignNoteModal from '../components/SignNoteModal';
import { downloadNotePdf, listNotes } from '../lib/api/weeklyNotes';
import type { WeeklyNote } from '../lib/api/weeklyNotes';

/**
 * Las notas del TECNICO. No las crea ni las elige (NOTA-01): salen solas al enviar la
 * semana, una por proyecto. Aqui las mira, si se la devolvieron lee el porque, y —desde
 * la Fase 5— la FIRMA con el cliente y se descarga el PDF congelado.
 *
 * La firma vive aqui y no en «Mi semana» porque una nota es de UN proyecto: si el tecnico
 * trabajo en dos obras la misma semana hay dos notas y dos clientes, y en la pantalla de
 * la semana no hay forma de decir cual de los dos esta firmando.
 *
 * El filtro por tecnico va explicito, y no es una segunda verdad frente a RLS: la
 * politica `wn_read` acota a `app.technician_id` SOLO cuando el que pregunta no es
 * admin. Una cuenta que es tecnico Y admin a la vez (la del seed es T+A+S) lleva
 * `is_admin = 'on'` y veria aqui las notas de toda la empresa.
 */
export default function Notes() {
  const { state, t, go, patch, showToast } = useApp();
  const miTecnico = state.me?.status === 'ok' ? state.me.user.technicianId : null;
  const { data, error } = useApiData(
    () => (miTecnico ? listNotes(undefined, miTecnico) : Promise.resolve([])),
    [miTecnico, state.dataVersion],
  );
  const [firmando, setFirmando] = useState<WeeklyNote | null>(null);
  const [errPdf, setErrPdf] = useState<string | null>(null);

  if (error) return <ApiState error={error} label={t.err_load} />;
  if (!data) return <ApiState error={null} label={t.loading} />;

  if (!data.length) {
    return (
      <Empty
        icon={svg(ICON.doc, { w: 30 })}
        msg={t.empty_notes}
        btn={t.btn_logday}
        onClick={() => patch({ logOpen: true })}
      />
    );
  }

  /** Los bytes ya congelados. Se abren en una pestaña: el navegador decide si los
      muestra o los baja, y no hay que inventar un nombre de archivo aqui. */
  const descargar = (n: WeeklyNote) => {
    setErrPdf(null);
    downloadNotePdf(n.id)
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
        // El objeto vive hasta que se revoque; un minuto basta para que la pestaña lo lea.
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      })
      .catch((e: unknown) => {
        setErrPdf(codigo(e));
        showToast('error');
      });
  };

  return (
    <>
      <div className="max-w-[820px] mx-auto flex flex-col gap-3">
        {errPdf ? <div className="text-[12.5px] text-warn">{t.pdf_error}: {errPdf}</div> : null}
        {data.map((n) => (
          <Card key={n.id}>
            <CardContent className="p-4">
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[200px]">
                  <div className="text-[14.5px] font-bold">{n.projectName}</div>
                  <div className="text-[12.5px] text-muted-foreground font-mono">
                    {n.weekStart}
                    {n.roleTypeName ? ` · ${n.roleTypeName}` : ''}
                  </div>
                </div>
                <StatusPill st={n.status as never} t={t} />
                {/* Solo se firma lo ENVIADO y todavia sin firma: el servidor rechaza lo
                    demas, y ofrecer el boton igual seria prometer algo que no pasa. */}
                {n.status === 'submitted' && !n.signed ? (
                  <Button onClick={() => setFirmando(n)} className="min-h-11 md:min-h-9">
                    {hi('pencil', { w: 15 })}
                    {t.btn_signnote}
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={() => patch({ pdfOpen: true, pdfNoteId: n.id, pdfSigned: n.signed })}
                  className="min-h-11 md:min-h-9"
                >
                  {hi('eye', { w: 15 })}
                  {t.btn_pdf}
                </Button>
                {n.signed ? (
                  <Button variant="outline" onClick={() => descargar(n)} className="min-h-11 md:min-h-9">
                    {hi('download', { w: 15 })}
                    {t.pdf_download}
                  </Button>
                ) : null}
                {/* «Reenviar» NO es un botón propio: se corrige el día en la semana y se
                    vuelve a enviar desde allí. Un botón aquí sugeriría que la nota se
                    puede reenviar sin tocar lo que la hizo volver. */}
                <Button variant="outline" onClick={() => go('week')} className="min-h-11 md:min-h-9">
                  {t.btn_open}
                </Button>
              </div>
              {n.returnComment ? (
                <div className="mt-3 flex gap-2.5 bg-warn-tint border border-warn rounded-lg px-3 py-2.5">
                  <div className="text-warn shrink-0">{svg(ICON.triangle, { w: 17 })}</div>
                  <div>
                    <div className="text-xs font-bold text-warn">{t.returned_note}</div>
                    <div className="text-[12.5px] text-muted-foreground mt-0.5">{n.returnComment}</div>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ))}
      </div>

      {firmando ? <SignNoteModal nota={firmando} onClose={() => setFirmando(null)} /> : null}
    </>
  );
}
