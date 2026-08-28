import { env } from '../../config/env';

/**
 * El envio por Microsoft Graph, con `fetch` nativo y sin dependencias nuevas.
 *
 * Sin `@azure/identity`: client-credentials es un POST de formulario y un token en
 * memoria, y ese paquete arrastra decenas de transitivas para eso. Si FAVA prohibiera
 * los secretos de cliente y exigiera certificado, la salida es `client_assertion`
 * firmado con `jose`, que YA esta instalado por el EntraGuard — pero no se escribe
 * hasta que alguien lo pida.
 *
 * El token de aplicacion NO es el de la peticion del usuario: aqui la app actua en su
 * propio nombre (`Mail.Send` como permiso de APLICACION), no en el de nadie. Por eso el
 * envio vive en el cron y no cuelga de ninguna sesion.
 */

export interface Resultado {
  ok: boolean;
  error?: string;
  /** Un fallo que no mejora reintentando: destinatario invalido, politica de Exchange. */
  permanente?: boolean;
}

let cache: { token: string; expira: number } | null = null;

async function tokenApp(): Promise<string> {
  // 5 minutos de colchon: un token que caduca a mitad del lote da 401 en la fila 30.
  if (cache && Date.now() < cache.expira) return cache.token;

  const r = await fetch(
    `https://login.microsoftonline.com/${env.ENTRA_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        // El registro del CORREO, no el del API: son dos aplicaciones distintas.
        client_id: env.ENTRA_MAIL_CLIENT_ID ?? '',
        client_secret: env.ENTRA_CLIENT_SECRET ?? '',
        // `.default` = «todos los permisos de aplicacion ya consentidos», que es como
        // se piden en client-credentials. Pedir `Mail.Send` suelto aqui da error.
        scope: 'https://graph.microsoft.com/.default',
      }),
    },
  );
  if (!r.ok) throw new Error(`token ${r.status}: ${(await r.text()).slice(0, 300)}`);

  const j = (await r.json()) as { access_token: string; expires_in: number };
  cache = { token: j.access_token, expira: Date.now() + (j.expires_in - 300) * 1000 };
  return cache.token;
}

/**
 * `POST /users/{buzon}/sendMail`. Devuelve 202 sin cuerpo cuando lo acepta.
 *
 * El buzon del path es el remitente, y ahi esta el peligro que documenta ENV.md:
 * `Mail.Send` de aplicacion permite poner CUALQUIER buzon del tenant. Lo unico que lo
 * impide es la Application Access Policy de Exchange, que es configuracion y no codigo.
 */
export async function enviarPorGraph(n: {
  toEmail: string;
  subject: string;
  bodyText: string;
}): Promise<Resultado> {
  try {
    const r = await fetch(
      `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(env.NOTIF_FROM ?? '')}/sendMail`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await tokenApp()}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            subject: n.subject,
            body: { contentType: 'Text', content: n.bodyText },
            toRecipients: [{ emailAddress: { address: n.toEmail } }],
          },
          // Deja copia en Enviados del buzon: es lo que permite a Andrea comprobar
          // desde Outlook que algo salio, sin pedirle a nadie una consulta SQL.
          saveToSentItems: true,
        }),
      },
    );
    if (r.ok) return { ok: true };

    const detalle = (await r.text()).slice(0, 300);
    // 4xx que no sea 429 no mejora reintentando: direccion mal escrita, buzon que la
    // politica de Exchange no deja usar, permiso sin consentir. Quemar cinco intentos
    // solo retrasa el momento de enterarse.
    const permanente = r.status >= 400 && r.status < 500 && r.status !== 429;
    return { ok: false, error: `${r.status}: ${detalle}`, permanente };
  } catch (e) {
    // Red caida o DNS: transitorio por definicion, que lo reintente el siguiente tic.
    return { ok: false, error: (e as Error).message };
  }
}

/**
 * El transporte de mentira, y el estado por defecto. No es un modo degradado: la fila se
 * encola, se renderiza y se marca enviada igual — lo unico que no ocurre es la llamada
 * a la red. Es a la vez el dry-run, el modo de los tests y con el que se despliega la
 * fase entera antes de que Entra conceda nada.
 */
export function enviarPorConsola(n: { toEmail: string; subject: string }): Resultado {
  console.log(`  [console] -> ${n.toEmail} :: ${n.subject}`);
  return { ok: true };
}

export const enviarCorreo = (n: { toEmail: string; subject: string; bodyText: string }) =>
  env.NOTIF_TRANSPORT === 'graph' ? enviarPorGraph(n) : Promise.resolve(enviarPorConsola(n));
