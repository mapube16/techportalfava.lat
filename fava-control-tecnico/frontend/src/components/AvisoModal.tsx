import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useApp } from '../state';

/**
 * El aviso que PARA al usuario: lo que acaba de intentar no se pudo hacer, y aquí está
 * el motivo en cristiano.
 *
 * POR QUE UN MODAL Y NO EL TEXTO ROJO DE SIEMPRE. Un `FieldError` debajo de un campo
 * sirve para «esto está mal escrito, corrígelo aquí»: el ojo ya está ahí. No sirve para
 * «tu semana ya está enviada y esto lo tiene que deshacer un administrador», que es un
 * cambio de plan y hay que leerlo entero. Ese aviso salía en una línea al pie de un
 * botón, con el código interno del servidor por todo texto.
 *
 * Se cierra con el botón, con la X, con Escape y pulsando fuera: es informativo, no
 * decide nada, y encerrar a alguien en un cartel que ya leyó es de mal gusto.
 */
export default function AvisoModal({
  titulo,
  mensaje,
  onClose,
}: {
  titulo: string;
  mensaje: string;
  onClose: () => void;
}) {
  const { t } = useApp();
  return (
    <div
      onClick={onClose}
      role="alertdialog"
      aria-modal="true"
      aria-label={titulo}
      className="fixed inset-0 z-70 bg-black/50 grid place-items-center p-5 fava-anim"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px] bg-card rounded-2xl shadow-pop fava-anim"
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-4.5 pb-1">
          <div className="text-base font-bold">{titulo}</div>
          <Button
            variant="outline"
            size="icon"
            onClick={onClose}
            aria-label={t.pdf_close}
            className="size-9 shrink-0"
          >
            <X className="size-4" />
          </Button>
        </div>
        <div className="px-5 pb-5 pt-1.5">
          <div className="text-[13.5px] leading-relaxed text-muted-foreground">{mensaje}</div>
          <div className="flex justify-end mt-4">
            {/* Autofoco: quien llega aquí con el teclado sale con un Enter. */}
            <Button autoFocus onClick={onClose} className="min-h-11 md:min-h-9">
              {t.pdf_close}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
