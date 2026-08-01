import { useEffect, useRef } from 'react';

// Canvas de firma: dibujo con mouse/touch, escala 2x para nitidez.
export default function SignatureBox({
  onSigned,
  clearToken,
}: {
  onSigned: () => void;
  clearToken: number;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);

  useEffect(() => {
    const c = ref.current;
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
    const c = ref.current;
    const ctx = ctxRef.current;
    if (c && ctx && clearToken > 0) ctx.clearRect(0, 0, c.width, c.height);
  }, [clearToken]);

  return <canvas ref={ref} className="w-full h-full touch-none cursor-crosshair" />;
}
