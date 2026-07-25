import { useMemo } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import logoRaw from './assets/fava-logo.svg?raw';

interface SvgOpts {
  w?: number;
  h?: number;
  sw?: number;
}

export const svg = (paths: string[], o: SvgOpts = {}) => (
  <svg
    width={o.w || 18}
    height={o.h || o.w || 18}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={o.sw || 2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {paths.map((d, i) => (
      <path key={i} d={d} />
    ))}
  </svg>
);

export const ICON: Record<string, string[]> = {
  home: ['M3 11l9-8 9 8', 'M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10'],
  cal: ['M8 3v4M16 3v4M3 10h18', 'M4 6h16v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1z'],
  doc: ['M14 3v5h5', 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8z', 'M9 13h6M9 17h4'],
  inbox: ['M3 13h5l1 3h6l1-3h5', 'M5 5h14l2 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-6z'],
  folder: ['M3 7a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z'],
  users: ['M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1', 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7', 'M22 20v-1a4 4 0 0 0-3-3.8M16 4.2A3.5 3.5 0 0 1 16 11'],
  chart: ['M4 20V10M10 20V4M16 20v-7M22 20H2'],
  shield: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M9 12l2 2 4-4'],
  gear: ['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6', 'M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 0 1-4 0v-.1A1.6 1.6 0 0 0 7 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H1a2 2 0 0 1 0-4h.1A1.6 1.6 0 0 0 2.6 7a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 7 2.6 1.6 1.6 0 0 0 8 1.1V1a2 2 0 0 1 4 0v.1A1.6 1.6 0 0 0 15 2.6a1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V7a1.6 1.6 0 0 0 1.5 1H23a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z'],
  logout: ['M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4', 'M16 17l5-5-5-5M21 12H9'],
  search: ['M21 21l-4-4'],
  globe: ['M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18'],
  bell: ['M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9', 'M10 21a2 2 0 0 0 4 0'],
  sun: ['M12 3v2M12 19v2M5 12H3M21 12h-2M6 6l1.5 1.5M16.5 16.5L18 18M18 6l-1.5 1.5M7.5 16.5L6 18', 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8'],
  moon: ['M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
  triangle: ['M12 9v4M12 17h.01', 'M10.3 3.9L2 18a2 2 0 0 0 1.7 3h16.6a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z'],
  shieldPlain: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'],
};

const HERO: Record<string, string[]> = {
  check: ['m4.5 12.75 6 6 9-13.5'],
  ureturn: ['M9 15 3 9m0 0 6-6M3 9h12a6 6 0 0 1 0 12h-3'],
  up: ['M12 3v13.5', 'm7.5 7.5 4.5-4.5 4.5 4.5', 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5'],
  download: ['M12 3v13.5', 'm16.5 12-4.5 4.5L7.5 12', 'M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5'],
  pencil: ['m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Z'],
  key: ['M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H9v1.5H7.5v1.5H6v1.5H2.25a.75.75 0 0 1-.75-.75v-2.69c0-.199.079-.39.22-.53l6.578-6.578c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z'],
  plus: ['M12 4.5v15m7.5-7.5h-15'],
  lock: ['M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75', 'M6.75 10.5h10.5a1.5 1.5 0 0 1 1.5 1.5v7.5a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5V12a1.5 1.5 0 0 1 1.5-1.5Z'],
  x: ['M6 18 18 6M6 6l12 12'],
  warn: ['M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z'],
  phone: ['M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3m-3 18.75h3'],
  desktop: ['M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25'],
  eye: ['M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z', 'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z'],
  funnel: ['M3.792 2.938A49.069 49.069 0 0 1 12 2.25c2.797 0 5.54.236 8.209.688a1.857 1.857 0 0 1 1.541 1.836v1.044a3 3 0 0 1-.879 2.121l-6.182 6.182a1.5 1.5 0 0 0-.439 1.061v2.927a3 3 0 0 1-1.658 2.684l-1.757.878A.75.75 0 0 1 9.75 21v-5.818a1.5 1.5 0 0 0-.44-1.06L3.13 7.938a3 3 0 0 1-.879-2.121V4.774c0-.897.64-1.66 1.542-1.836Z'],
};

export const hi = (n: keyof typeof HERO | string, o: SvgOpts = {}) => svg(HERO[n], { w: o.w || 16, sw: o.sw || 1.7 });

export const Dots = ({ w = 16 }: { w?: number }) => (
  <svg width={w} height={w} viewBox="0 0 24 24" fill="currentColor">
    {[6, 12, 18].map((cx) => (
      <circle key={cx} cx={cx} cy={12} r={1.7} />
    ))}
  </svg>
);

// Marca FAVA centralizada — logo oficial extraído de "Logo Fava LatinoAmerica.ai".
// `onDark` recolorea a blanco para fondos oscuros (login, onboarding, tema dark):
// biseles blancos → transparentes, navy → blanco, banda gris → blanco al 38%.
export function FavaLogo({ height = 40, onDark = false, style }: { height?: number; onDark?: boolean; style?: CSSProperties }) {
  const html = useMemo(() => {
    let s = logoRaw;
    if (onDark) {
      s = s
        .replace(/fill="#ffffff"/g, 'fill="none"')
        .replace(/fill="#314775"/g, 'fill="#ffffff"')
        .replace(/fill="#bebcbc"/g, 'fill="#ffffff" fill-opacity=".38"');
    }
    return s.replace('<svg ', `<svg style="height:${height}px;width:auto;display:block" `);
  }, [height, onDark]);
  return <span role="img" aria-label="FAVA Latino America" style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}

export type { ReactNode };
