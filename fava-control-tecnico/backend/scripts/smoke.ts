/**
 * Smoke post-deploy. Obligatorio en CADA despliegue de la Fase 1: tres de los
 * cinco criterios del roadmap solo son observables desplegado.
 *
 *   npm -w backend run smoke -- https://<dominio>.up.railway.app
 *
 * Sin argumento apunta a http://127.0.0.1:3000, util contra el build local.
 * Salida: una linea por check y exit code 1 si alguno falla (para CI).
 *
 * Solo fetch nativo de Node 22: un smoke con dependencias es una cosa mas que
 * puede fallar por su cuenta justo cuando hay que confiar en el.
 */

const base = (process.argv[2] ?? process.env.SMOKE_URL ?? 'http://127.0.0.1:3000').replace(
  /\/+$/,
  '',
);

/** null = el check pasa; string = por que fallo. */
type Resultado = string | null;

const get = (ruta: string): Promise<Response> =>
  // redirect: 'manual' para que una redireccion inesperada suspenda el check en
  // vez de seguirla y dar por bueno el 200 de otra ruta.
  fetch(`${base}${ruta}`, { redirect: 'manual' });

const checks: Array<[string, () => Promise<Resultado>]> = [
  [
    'GET /health -> 200',
    async () => {
      const res = await get('/health');
      return res.status === 200 ? null : `status ${res.status} (esperado 200)`;
    },
  ],
  [
    'GET /redirect.html -> 200 y SIN Cross-Origin-Opener-Policy',
    async () => {
      const res = await get('/redirect.html');
      if (res.status !== 200) {
        return `status ${res.status} (esperado 200: el puente de MSAL no se esta sirviendo)`;
      }
      const coop = res.headers.get('cross-origin-opener-policy');
      // Con COOP, el browsing context group swap corta el canal de vuelta a la
      // app principal: el login se queda colgado sin ningun error visible.
      return coop === null
        ? null
        : `cabecera cross-origin-opener-policy: "${coop}" — helmet rompio el puente MSAL`;
    },
  ],
  [
    'GET /api/me sin Authorization -> 401',
    async () => {
      const res = await get('/api/me');
      if (res.status === 401) return null;
      // Un 200 con HTML significa que ServeStatic se comio la ruta /api.
      const tipo = res.headers.get('content-type') ?? '';
      return `status ${res.status} (esperado 401)${
        tipo.includes('text/html') ? ' y HTML: el estatico esta capturando /api' : ''
      }`;
    },
  ],
  [
    'GET / -> 200 text/html',
    async () => {
      const res = await get('/');
      if (res.status !== 200) return `status ${res.status} (esperado 200: falta frontend/dist)`;
      const tipo = res.headers.get('content-type') ?? '';
      return tipo.includes('text/html') ? null : `content-type "${tipo}" (esperado text/html)`;
    },
  ],
];

async function main(): Promise<void> {
  console.log(`smoke -> ${base}\n`);
  let fallos = 0;

  for (const [nombre, ejecutar] of checks) {
    let motivo: Resultado;
    try {
      motivo = await ejecutar();
    } catch (e) {
      motivo = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    if (motivo === null) {
      console.log(`  ✓ ${nombre}`);
    } else {
      console.log(`  ✗ ${nombre}\n      ${motivo}`);
      fallos++;
    }
  }

  console.log(`\n${checks.length - fallos}/${checks.length} checks en verde`);
  process.exitCode = fallos === 0 ? 0 : 1;
}

void main();
