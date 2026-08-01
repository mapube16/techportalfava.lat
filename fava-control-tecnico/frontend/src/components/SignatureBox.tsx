import { useEffect, useImperativeHandle, useRef } from 'react';
import type { Ref } from 'react';

/**
 * Canvas de firma: dibujo con mouse/touch, escala 2x para nitidez.
 *
 * `ref` expone el trazo como PNG en base64 (sin el `data:`), que es lo que el servidor
 * guarda como evidencia y estampa en el PDF. Va por ref y no por `onChange` a propósito:
 * el trazo cambia en cada `mousemove` y subir un base64 de ~20 KB al estado en cada
 * movimiento repintaría el formulario entero mientras alguien está firmando.
 */
export interface SignatureHandle {
  /** `null` si el lienzo está en blanco. */
  toPng(): string | null;
}

export default function SignatureBox({
  onSigned,
  clearToken,
  ref,
}: {
  onSigned: () => void;
  clearToken: number;
  ref?: Ref<SignatureHandle>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const trazado = useRef(false);

  useImperativeHandle(ref, () => ({
    toPng: () => {
      const c = canvasRef.current;
      if (!c || !trazado.current) return null;
      // El canvas es transparente y el PDF lo estampa sobre papel blanco, así que el
      // PNG con alfa va bien tal cual: pintarle fondo taparía la línea de la casilla.
      return c.toDataURL('image/png').split(',')[1] ?? null;
    },
  }));

  useEffect(() => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctxRef.current = ctx;
    const r = c.getBoundingClientRect();
    c.width = r.width * 2;
    c.height = r.height * 2;
    ctx.scale(2, 2);
    const fava = document.querySelector('.fava');
    ctx.strokeStyle = (fava ? getComputedStyle(fava).getPropertyValue('--text').trim() : '') || '#132330';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    let drawing = false;
    let last: { x: number; y: number } | null = null;
    const pos = (e: MouseEvent | TouchEvent) => {
      const b = c.getBoundingClientRect();
      const p = 'touches' in e ? e.touches[0] : e;
      return { x: p.clientX - b.left, y: p.clientY - b.top };
    };
    const down = (e: MouseEvent | TouchEvent) => {
      drawing = true;
      last = pos(e);
      e.preventDefault();
    };
    const move = (e: MouseEvent | TouchEvent) => {
      if (!drawing || !last) return;
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      last = p;
      trazado.current = true;
      onSigned();
      e.preventDefault();
    };
    const up = () => {
      drawing = false;
    };
    c.addEventListener('mousedown', down);
    c.addEventListener('mousemove', move);
    window.addEventListener('mouseup', up);
    c.addEventListener('touchstart', down, { passive: false });
    c.addEventListener('touchmove', move, { passive: false });
    c.addEventListener('touchend', up);
    return () => {
      c.removeEventListener('mousedown', down);
      c.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
      c.removeEventListener('touchstart', down);
      c.removeEventListener('touchmove', move);
      c.removeEventListener('touchend', up);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const c = canvasRef.current;
    const ctx = ctxRef.current;
    if (c && ctx && clearToken > 0) {
      ctx.clearRect(0, 0, c.width, c.height);
      trazado.current = false;
    }
  }, [clearToken]);

  return <canvas ref={canvasRef} className="w-full h-full touch-none cursor-crosshair" />;
}
