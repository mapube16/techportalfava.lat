import { Button } from '@/components/ui/button';
import { ConceptCode, btnGhostLight } from '../ui';
import { FavaLogo } from '../icons';
import { useApp } from '../state';

/**
 * Vista previa del PDF. Simula el papel: colores FIJOS (blanco, negro, el azul FAVA)
 * porque el documento se ve igual en tema claro y oscuro de la app — no hereda la
 * paleta, la representa. Por eso van como valores arbitrarios de Tailwind (`bg-[#fff]`)
 * y no como los tokens `bg-card`/`text-foreground` del resto de la interfaz.
 *
 * Sigue siendo la maqueta de la Fase 5 (`state.week`/`state.expenses`, datos de
 * ejemplo): el generador real (`nota-pdf.ts` en el backend) ya existe y produce el PDF
 * fiel al formato, pero conectar esta vista previa a él es el trabajo pendiente de
 * firma y descarga, no un cambio de estilos.
 */
export default function PdfPreview() {
  const { state, t, patch, showToast } = useApp();
  const close = () => patch({ pdfOpen: false });
  const download = () => {
    close();
    showToast('submitted');
  };

  return (
    <div
      onClick={close}
      className="fixed inset-0 z-65 bg-black/60 flex flex-col items-center p-5.5 overflow-y-auto fava-anim"
    >
      <div className="flex gap-2.5 self-center mb-4">
        <Button onClick={(e) => { e.stopPropagation(); download(); }} className="min-h-11 md:min-h-9">
          {t.pdf_download}
        </Button>
        <button onClick={(e) => { e.stopPropagation(); close(); }} className={btnGhostLight}>
          {t.pdf_close}
        </button>
      </div>

      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-[720px] fava-anim">
        <div className="bg-white text-[#1a1a1a] w-full shadow-[0_2px_10px_rgba(0,0,0,.15)]">
          <div className="px-7.5 py-6.5 border-b-[3px] border-[#104A78] flex items-center justify-between">
            <FavaLogo height={46} />
            <div className="text-right">
              <div className="text-[15px] font-bold text-[#104A78]">{t.pdf_title}</div>
              <div className="text-[11px] text-[#666]">20–26 Jul 2026</div>
            </div>
          </div>

          <div className="px-7.5 pt-4.5 pb-2 flex gap-7.5 text-[11px] text-[#555]">
            {[
              [t.col_tech, 'Ivan Cortés'],
              [t.client, 'Molino Cibao Bocel — RD'],
              [t.machines, 'CTA1000 · PL6000'],
            ].map(([a, b]) => (
              <div key={a}>
                <div className="text-[#999] uppercase tracking-wide text-[9px]">{a}</div>
                <div className="font-semibold text-[#222] text-[12.5px]">{b}</div>
              </div>
            ))}
          </div>

          <table className="w-[calc(100%-60px)] mx-7.5 my-3 border-collapse">
            <thead>
              <tr>
                {['Día', 'Concepto', 'Descripción del trabajo'].map((c, i) => (
                  <th
                    key={i}
                    className="text-left px-2.5 py-1.5 text-[9.5px] uppercase tracking-wide text-white bg-[#104A78]"
                  >
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {state.week.map((d, i) => (
                <tr key={i}>
                  <td className="px-2.5 py-2 text-[11px] text-[#333] border-b border-[#e2e2e2] align-top whitespace-nowrap font-semibold">
                    {t.days[i]} {20 + i}
                  </td>
                  <td className="px-2.5 py-2 text-[11px] text-[#333] border-b border-[#e2e2e2] align-top">
                    <ConceptCode code={d.concept} />
                  </td>
                  <td className="px-2.5 py-2 text-[11px] text-[#444] border-b border-[#e2e2e2] align-top leading-relaxed">
                    {d.desc}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="px-7.5 py-1.5 flex gap-10 items-end justify-between">
            <div className="flex-1">
              <div className="text-[9.5px] uppercase tracking-wide text-[#999] mb-1">{t.expenses}</div>
              {state.expenses.map((e, i) => (
                <div key={i} className="flex justify-between text-[11px] py-0.5 border-b border-[#eee] max-w-[260px]">
                  <span className="text-[#444]">{e.desc}</span>
                  <span className="font-mono font-semibold">{e.val}</span>
                </div>
              ))}
            </div>
            <div className="text-center">
              <div className="w-[180px] border-b border-[#333] h-11 mb-1.5 italic text-[#104A78] flex items-end justify-center text-base serif">
                R. Peña
              </div>
              <div className="text-[10px] text-[#666]">{t.sign}</div>
              <div className="text-[9.5px] text-[#999]">Ing. Robert Peña · Cibao Industrial</div>
            </div>
          </div>

          <div className="px-7.5 py-3 mt-2 border-t border-[#e2e2e2] text-[9px] text-[#aaa] flex justify-between">
            <span>{t.pdf_note}</span>
            <span>OA-2451 · {new Date().toLocaleDateString('es-CL')}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
