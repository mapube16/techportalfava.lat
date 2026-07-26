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

/** El check no se puede ejecutar por falta de credenciales: no es un fallo. */
const OMITIDO = Symbol('omitido');

/** null = el check pasa; string = por que fallo; OMITIDO = no aplica. */
type Resultado = string | null | typeof OMITIDO;

const get = (ruta: string, token?: string): Promise<Response> =>
  // redirect: 'manual' para que una redireccion inesperada suspenda el check en
  // vez de seguirla y dar por bueno el 200 de otra ruta.
  fetch(`${base}${ruta}`, {
    redirect: 'manual',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });

/** 401 sin credenciales prueba dos cosas: que la ruta existe y que no es publica. */
const exige401 = (ruta: string) => async (): Promise<Resultado> => {
  const res = await get(ruta);
  if (res.status === 401) return null;
  // Un 200 con HTML significa que ServeStatic se comio la ruta /api.
  const tipo = res.headers.get('content-type') ?? '';
  return `status ${res.status} (esperado 401)${
    tipo.includes('text/html') ? ' y HTML: el estatico esta capturando /api' : ''
  }`;
};

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
  ['GET /api/me sin Authorization -> 401', exige401('/api/me')],
  ['GET /api/catalogs sin Authorization -> 401', exige401('/api/catalogs')],
  ['GET /api/projects sin Authorization -> 401', exige401('/api/projects')],
  [
    // EL check del Pitfall 7. `ALTER DEFAULT PRIVILEGES` solo cubre las tablas que
    // creo EL MISMO rol que lo ejecuto: si en Railway `db:bootstrap` y
    // `migrate deploy` los corre un usuario distinto, las 8 tablas de la Fase 2
    // nacen sin permisos para fava_app y la app responde `permission denied for
    // table projects` justo despues de un deploy EXITOSO. En local no se ve nunca
    // porque ahi es el mismo rol, asi que sin este check el sintoma es «todo verde
    // en local y permission denied en produccion».
    'GET /api/catalogs y /api/projects autenticados -> 200 (privilegios de las tablas nuevas)',
    async () => {
      const email = process.env.SMOKE_DEV_EMAIL;
      const password = process.env.SMOKE_DEV_PASSWORD;
      if (!email || !password) return OMITIDO;

      const login = await fetch(`${base}/api/dev-auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
        redirect: 'manual',
      });
      if (login.status !== 200) return `login de dev: status ${login.status} (esperado 200)`;
      const { access_token: token } = (await login.json()) as { access_token?: string };
      if (!token) return 'login de dev: la respuesta no trae access_token';

      for (const ruta of ['/api/catalogs', '/api/projects']) {
        const res = await get(ruta, token);
        if (res.status !== 200) {
          const cuerpo = (await res.text()).slice(0, 200);
          return `GET ${ruta}: status ${res.status} (esperado 200) — ${cuerpo}`;
        }
      }
      return null;
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
  let omitidos = 0;

  for (const [nombre, ejecutar] of checks) {
    let motivo: Resultado;
    try {
      motivo = await ejecutar();
    } catch (e) {
      motivo = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }
    if (motivo === null) {
      console.log(`  ✓ ${nombre}`);
    } else if (motivo === OMITIDO) {
      console.log(`  ↷ ${nombre}\n      omitido (sin SMOKE_DEV_EMAIL / SMOKE_DEV_PASSWORD)`);
      omitidos++;
    } else {
      console.log(`  ✗ ${nombre}\n      ${motivo}`);
      fallos++;
    }
  }

  const aplicables = checks.length - omitidos;
  console.log(
    `\n${aplicables - fallos}/${aplicables} checks en verde${
      omitidos ? ` (${omitidos} omitido${omitidos > 1 ? 's' : ''})` : ''
    }`,
  );
  process.exitCode = fallos === 0 ? 0 : 1;
}

void main();
