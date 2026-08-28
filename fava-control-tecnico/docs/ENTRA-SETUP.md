# Entra ID — receta de los app registrations

Cómo crear desde cero la identidad de FAVA Control Técnico. Escrito para poder
**rehacerlo entero en otro tenant** (dev personal → tenant de FAVA) sin arqueología:
la receta es la misma, sólo cambian los valores de las variables de entorno.

Tiempo: ~15 minutos la primera vez. Necesitas ser **administrador del tenant**
(para el "Grant admin consent" del final).

Resultado: 4 valores que se copian a `backend/.env` y `frontend/.env`
(ver [ENV.md](./ENV.md)) y nada más. **Cero cambios de código al cambiar de tenant.**

---

## Antes de empezar

Se crean **dos** registros de aplicación:

| Registro | Nombre | Qué es | Quién lo usa |
|---|---|---|---|
| **A** | `FAVA Control Tecnico API` | El **recurso** protegido. Define el permiso `access_as_user` y es el `aud` (audiencia) de los tokens. | El backend NestJS, para validar tokens |
| **B** | `FAVA Control Tecnico SPA` | El **cliente**. La app de navegador que pide el login. | El frontend React (MSAL) |

Se hacen dos porque es lo que recomienda Microsoft y deja el `aud` del token
semánticamente limpio: cliente y recurso son cosas distintas. Si el IT de FAVA
objeta tener dos registros en el tenant corporativo, hay una
[variante de un solo registro](#variante-un-solo-registro-fallback) al final —
el cambio es de **dos variables de entorno**, cero código.

Portal: **<https://entra.microsoft.com>** → menú lateral **Identity → Applications
→ App registrations**. (El portal cambia de aspecto cada pocos meses; si no
encuentras un menú, usa el buscador de arriba: "App registrations".)

---

## Registro A — `FAVA Control Tecnico API`

### A.1 Crear el registro

1. **App registrations** → **+ New registration**.
2. **Name:** `FAVA Control Tecnico API`
3. **Supported account types:** *Accounts in this organizational directory only
   (**Single tenant**)*. ← Importante: es una app interna, nadie de fuera del
   tenant debe poder autenticarse.
4. **Redirect URI:** **déjalo vacío**. Una API no recibe redirecciones del navegador.
5. **Register**.

### A.2 Copiar los dos primeros valores

En la pantalla **Overview** que aparece:

| Campo del portal | Variable |
|---|---|
| **Application (client) ID** | `ENTRA_API_CLIENT_ID` |
| **Directory (tenant) ID** | `ENTRA_TENANT_ID` (y `VITE_ENTRA_TENANT_ID`, mismo valor) |

Ambos son UUIDs con el formato `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`.

### A.3 Exponer el permiso `access_as_user`

1. Menú lateral del registro: **Manage → Expose an API**.
2. Arriba, **Application ID URI** → **Add** → el portal propone
   `api://<application-client-id>` → **Save**. Acepta el valor propuesto tal cual.
3. **+ Add a scope**:
   - **Scope name:** `access_as_user` ← exacto, en minúsculas y con guiones bajos.
     El backend lo compara literalmente (`ENTRA_REQUIRED_SCOPE`).
   - **Who can consent:** *Admins and users*
   - **Admin consent display name:** `Acceder a FAVA Control Técnico como el usuario`
   - **Admin consent description:** `Permite a la aplicación llamar al API de FAVA Control Técnico en nombre del usuario que ha iniciado sesión.`
   - **User consent display name:** `Acceder a FAVA Control Técnico en tu nombre`
   - **User consent description:** `Permite a la aplicación acceder a tus datos de FAVA Control Técnico.`
   - **State:** *Enabled*
   - **Add scope**
4. El scope completo queda visible en la lista como
   `api://<api-client-id>/access_as_user`. **Ese string completo es `VITE_API_SCOPE`.**

### A.4 El manifiesto: `requestedAccessTokenVersion: 2` ⚠️

**Este es el paso que se olvida y cuesta un día de depuración.** Sin él, Entra
emite tokens **v1** y el guard del backend (que valida contra el issuer `v2.0`)
los rechaza con un error de firma inválida que no tiene nada que ver con la firma.

1. Menú lateral del registro: **Manage → Manifest**.
2. Busca (Ctrl+F dentro del editor) el bloque `"api"` y dentro de él el campo
   **`requestedAccessTokenVersion`**. Debería aparecer así:

   ```jsonc
   "api": {
     "acceptMappedClaims": null,
     "knownClientApplications": [],
     "requestedAccessTokenVersion": null,   // ← poner 2
     "oauth2PermissionScopes": [ /* access_as_user */ ]
   }
   ```

3. Cámbialo a `2` (número, sin comillas) y pulsa **Save**.

**Si no encuentras ese campo:** el manifiesto ha tenido dos formatos históricos.
En el formato antiguo (AAD Graph) el campo se llama **`accessTokenAcceptedVersion`**
y está en el nivel raíz, no dentro de `"api"`. Si el editor ofrece un selector
de formato arriba ("Microsoft Graph App Manifest" / "AAD Graph App Manifest"),
sirve cualquiera de los dos: **el que exista, ponlo en `2`**.

Verificación de que quedó guardado: recarga la página del manifiesto y confirma
que el valor sigue siendo `2` (si el JSON tenía un error de sintaxis, el portal
no guarda y a veces el aviso pasa desapercibido).

---

## Registro B — `FAVA Control Tecnico SPA`

### B.1 Crear el registro

1. **App registrations** → **+ New registration**.
2. **Name:** `FAVA Control Tecnico SPA`
3. **Supported account types:** *Accounts in this organizational directory only
   (**Single tenant**)*.
4. **Redirect URI:** aquí sí. En el desplegable elige la plataforma
   **Single-page application (SPA)** ← **no** "Web", y escribe:

   ```
   http://localhost:5173/redirect.html
   ```

5. **Register**.
6. Copia **Application (client) ID** → es **`VITE_ENTRA_SPA_CLIENT_ID`**.

⚠️ **Dos trampas en este paso, ambas causan errores crípticos:**

- **La plataforma tiene que ser SPA, no Web.** Si eliges "Web", Entra exige un
  client secret y el login falla con `AADSTS9002326: Cross-origin token
  redemption is permitted only for the 'Single-Page Application' client-type`.
  Se arregla en **Manage → Authentication**: borra la plataforma Web y añade
  una **Single-page application** con la misma URI.
- **La URI termina en `/redirect.html`, no en `/`.** MSAL Browser v5 usa una
  página puente de redirección por el soporte de COOP del navegador; el redirect
  apunta a esa página, **no** a la home de la app. Si apuntas a la home, el login
  parece completarse y la aplicación nunca recibe el resultado.

### B.2 Redirect URIs — la lista completa

En **Manage → Authentication** conviven todas las URIs de la plataforma SPA:

| Entorno | Redirect URI | Cuándo se añade |
|---|---|---|
| Desarrollo local (Vite) | `http://localhost:5173/redirect.html` | Ahora |
| Producción (Railway) | `https://<dominio>.up.railway.app/redirect.html` | Durante el deploy (Plan 06), cuando Railway asigna el dominio |
| Dominio propio (futuro) | `https://<dominio-propio>/redirect.html` | Si FAVA pone dominio propio |

Se pueden tener todas a la vez. El match es **exacto**: protocolo, host, puerto y
ruta. Un `/redirect.html` frente a `/redirect.html/` es un fallo
(`AADSTS50011: The redirect URI ... does not match`).

> `http://localhost` es la única excepción que Entra permite sin HTTPS.

### B.3 Pedir el permiso del API

1. Menú lateral del registro SPA: **Manage → API permissions**.
2. **+ Add a permission** → pestaña **APIs my organization uses** → busca
   `FAVA Control Tecnico API` y selecciónala.
3. **Delegated permissions** → marca **`access_as_user`** → **Add permissions**.
4. **Grant admin consent for \<tu tenant\>** → **Yes**. La columna *Status* de
   `access_as_user` debe quedar en verde: **Granted for \<tenant\>**.

Sobre el `User.Read` de Microsoft Graph que el portal añade por defecto: es
inofensivo dejarlo. Lo que **nunca** hay que hacer es pedirlo en el mismo token
que el scope del API — ver [Verificación](#verificación-2-minutos-que-ahorran-un-día).

---

## Paso final: autorizar el SPA dentro del API

Vuelve al **Registro A** (`FAVA Control Tecnico API`):

1. **Manage → Expose an API** → sección **Authorized client applications**
   (abajo del todo).
2. **+ Add a client application**.
3. **Client ID:** pega el *Application (client) ID* del **Registro B (SPA)**.
4. Marca la casilla del scope `api://<api-client-id>/access_as_user`.
5. **Add application**.

Esto declara que el SPA es un cliente de confianza del API y **suprime la
pantalla de consentimiento** para los usuarios. Sin este paso el login funciona,
pero cada usuario ve un diálogo de permisos la primera vez.

---

## Verificación (2 minutos que ahorran un día)

**En el portal, ahora mismo:**

- [ ] Registro A → Manifest → `requestedAccessTokenVersion` (o `accessTokenAcceptedVersion`) = `2`
- [ ] Registro A → Expose an API → scope `access_as_user` **Enabled** y el SPA en *Authorized client applications*
- [ ] Registro A → **Token configuration → Add optional claim → Access → `email`**. Sin este claim el primer login de un invitado **no vincula**: el backend empareja la invitación por el claim `email` y nunca por `preferred_username`/`upn` (son mutables y reasignables en Entra). Síntoma: usuario dado de alta que ve «tu cuenta no está habilitada»
- [ ] Registro B → Authentication → plataforma **Single-page application**, URI acabada en `/redirect.html`
- [ ] Registro B → API permissions → `access_as_user` con estado **Granted**

**En el primer login real** (Plan 06), con las DevTools abiertas: copia el
`Authorization: Bearer <token>` de cualquier petición a `/api/` y pégalo en
**<https://jwt.ms>**. Comprueba:

| Claim | Valor esperado | Si no cuadra |
|---|---|---|
| `ver` | `"2.0"` | El manifiesto no se guardó → paso [A.4](#a4-el-manifiesto-requestedaccesstokenversion-2-️) |
| `aud` | el **client id del Registro A** (o `api://<client-id>`) | Ver la fila siguiente |
| `aud` = `00000003-0000-0000-c000-000000000000` | **nunca** | Es un token de **Microsoft Graph**, que por diseño **no se puede validar** desde una API propia. Causa: el frontend pidió `User.Read` (solo o mezclado). Debe pedir **únicamente** `[VITE_API_SCOPE]` |
| `iss` | `https://login.microsoftonline.com/<tenant-id>/v2.0` | Si acaba en `/` sin `v2.0`, es un token v1 → manifiesto |
| `tid` | tu `ENTRA_TENANT_ID` | Registro creado en otro tenant |
| `scp` | `access_as_user` | El scope no se concedió (paso B.3) |
| `email` | el email corporativo del usuario | Falta el optional claim del Registro A → el invitado ve «sin acceso» aunque su email esté dado de alta en la app |
| `oid` | UUID estable del usuario en el tenant | Es la identidad definitiva: se guarda en `users.entra_oid` en el primer login y el email pasa a ser dato de visualización |

---

## Los 4 valores que salen de aquí

| Variable | De dónde | Formato |
|---|---|---|
| `ENTRA_TENANT_ID` | Registro A (o B, es el mismo) → Overview → *Directory (tenant) ID* | UUID |
| `ENTRA_API_CLIENT_ID` | Registro **A** → Overview → *Application (client) ID* | UUID |
| `VITE_ENTRA_SPA_CLIENT_ID` | Registro **B** → Overview → *Application (client) ID* | UUID |
| `VITE_API_SCOPE` | Registro A → Expose an API → el scope completo | `api://<api-client-id>/access_as_user` |

`VITE_ENTRA_TENANT_ID` es el mismo valor que `ENTRA_TENANT_ID` (el frontend
necesita su propia copia porque Vite sólo expone las variables con prefijo
`VITE_`). Ninguno de los cuatro es secreto: los tres primeros van en el bundle
del navegador de todas formas. Ver [ENV.md](./ENV.md).

---

## Errores frecuentes y su causa real

| Síntoma | Causa | Arreglo |
|---|---|---|
| `AADSTS50011` redirect URI mismatch | La URI registrada no coincide **exactamente** con la que envía MSAL | Copiar literal desde el error y añadirla en Authentication |
| `AADSTS9002326` cross-origin token redemption | La plataforma del Registro B es *Web* en vez de *SPA* | Rehacer la plataforma como Single-page application |
| `AADSTS65001` consent required | Falta el *Grant admin consent* o el *Authorized client application* | Pasos B.3.4 y "Paso final" |
| Backend responde 401 "invalid signature" con un token que jwt.ms muestra bien | Token **v1**: el issuer no es el `v2.0` que el guard espera | `requestedAccessTokenVersion: 2` |
| Backend responde 401 con `aud` inesperado | El token es de Graph, o `ENTRA_API_CLIENT_ID` apunta al registro equivocado (el del SPA) | `ENTRA_API_CLIENT_ID` = client id del Registro **A** |
| El login se completa pero la app se queda en blanco | El redirect apunta a la home en vez de a `/redirect.html`, o `/redirect.html` se sirve con cabecera `Cross-Origin-Opener-Policy` | Paso B.1; y en el backend, helmet con `crossOriginOpenerPolicy: false` para esa ruta |

---

## Variante: un solo registro (fallback)

Si el IT de FAVA no quiere dos registros en el tenant corporativo, un único
registro puede ser cliente y recurso a la vez:

1. Crear **un** registro (`FAVA Control Tecnico`), single tenant, plataforma
   **Single-page application** con las redirect URIs de [B.2](#b2-redirect-uris--la-lista-completa).
2. En **ese mismo** registro: **Expose an API** → Application ID URI
   `api://<client-id>` → scope `access_as_user` → manifiesto
   `requestedAccessTokenVersion: 2`.
3. **API permissions** → *APIs my organization uses* → **él mismo** →
   `access_as_user` → **Grant admin consent**.
4. *Authorized client applications*: añadir su propio client id (o dejarlo — el
   consentimiento ya está concedido).

El cambio en la aplicación es **sólo de entorno**:

```diff
- ENTRA_API_CLIENT_ID=<client-id-del-API>
- VITE_ENTRA_SPA_CLIENT_ID=<client-id-del-SPA>
- VITE_API_SCOPE=api://<client-id-del-API>/access_as_user
+ ENTRA_API_CLIENT_ID=<el-único-client-id>
+ VITE_ENTRA_SPA_CLIENT_ID=<el-único-client-id>
+ VITE_API_SCOPE=api://<el-único-client-id>/access_as_user
```

**Cero líneas de código.** Lo que se pierde: la frontera semántica entre cliente
y recurso, y la lista de *Authorized client applications* deja de significar algo.
Por eso el default son dos.

---

## Cambio de tenant: dev → FAVA (AUTH-01)

El requisito AUTH-01 exige que pasar del tenant de desarrollo al de FAVA sea
**sólo variables de entorno**. El procedimiento completo:

1. Repetir este documento entero en el tenant de FAVA (Registro A, Registro B,
   manifiesto, consent, authorized client).
2. Añadir en el Registro B la redirect URI de producción que ya use la app.
3. Cambiar 5 valores donde corran la app (local `.env` y/o dashboard de Railway):
   `ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`, `VITE_ENTRA_TENANT_ID`,
   `VITE_ENTRA_SPA_CLIENT_ID`, `VITE_API_SCOPE`.
4. Cambiar `SEED_SUPERADMIN_EMAIL` al email corporativo del primer Super Admin y
   volver a correr el seed.
5. Redeploy (las `VITE_*` se hornean en tiempo de build: cambiarlas exige
   reconstruir el frontend, no basta con reiniciar).

No hay ningún identificador de tenant, client id ni scope escrito en el código.
Si aparece uno, es un bug.

---

## Registro C — `FAVA Avisos` (correo saliente, Fase 9)

Los registros A y B son **delegados**: la app actúa en nombre de quien inició sesión. El
correo es otra cosa — el cron escribe cuando no hay nadie conectado, así que la app
actúa **en su propio nombre**. Eso es un permiso de **aplicación**, y es el primero del
tenant.

**Registro aparte, no colgado del A.** El registro del API es un *resource server*: su
trabajo es validar tokens que entran. Convertirlo además en cliente confidencial con
secreto y permisos de aplicación mezcla dos papeles opuestos. Y como la Application
Access Policy de Exchange se ata a un AppId, con uno dedicado se revoca el envío de
correo sin tocar el login de nadie.

> **Esto NO obliga al cutover de Entra.** Mientras `DEV_AUTH_ENABLED=true`, el keyset
> local sustituye al de Microsoft (`jwks.provider.ts`) y `dev-auth.service.ts` fabrica el
> token con el `ENTRA_TENANT_ID` que haya. Crear este registro y encender el correo deja
> el login compartido funcionando igual. Son dos cosas independientes.

### C.1 — Crear el registro

Entra admin center → **Applications** → **App registrations** → **New registration**.

| Campo | Valor |
|---|---|
| Name | `FAVA Avisos` |
| Supported account types | **Accounts in this organizational directory only** (single tenant) |
| Redirect URI | **vacío** — nadie inicia sesión contra esta app; no hay navegador que redirigir |

Copiar de *Overview* el **Application (client) ID** → `ENTRA_MAIL_CLIENT_ID`.

### C.2 — El permiso

*API permissions* → **Add a permission** → **Microsoft Graph** → **Application
permissions** (⚠️ **no** *Delegated*) → buscar `Mail.Send` → *Add permissions*.

Después, **`Grant admin consent for <tenant>`**. Sin ese botón el permiso figura en la
lista pero **no está concedido**: el token sale sin el rol y el envío falla con `403`
sin decir que falta el consentimiento.

De paso, quitar el `User.Read` **delegado** que el portal añade solo: esta app no actúa
en nombre de ningún usuario y no lo usa nunca.

> Requiere **Global Administrator**, **Cloud Application Administrator** o **Privileged
> Role Administrator**. Ser administrador de Exchange **no basta** — el portal te deja
> llegar hasta el botón y solo entonces falla, que es lo que hace caro el error.

### C.3 — El secreto

*Certificates & secrets* → **New client secret**. Descripción `railway`, caducidad la que
permita la política de FAVA.

El valor **solo se ve una vez** y no se puede recuperar: cópialo en ese momento a
`ENTRA_CLIENT_SECRET`. Anota la fecha de caducidad — un secreto vencido apaga los avisos
en silencio, y nadie se entera hasta que alguien pregunta por qué no le llegó el correo.

### C.4 — ⛔ Acotar el buzón. El paso que nadie hace por defecto

`Mail.Send` como permiso de aplicación permite enviar **desde cualquier buzón del
tenant**: el del director, el de recursos humanos, el de facturación. Concederlo sin
acotar es darle a la app la capacidad de suplantar por correo a toda la empresa.

Se acota con una **Application Access Policy** de Exchange Online. Es PowerShell, no
portal:

```powershell
Install-Module ExchangeOnlineManagement -Scope CurrentUser   # solo la primera vez
Connect-ExchangeOnline

New-ApplicationAccessPolicy `
  -AppId <ENTRA_MAIL_CLIENT_ID> `
  -PolicyScopeGroupId techportal@favalatinoamerica.com `
  -AccessRight RestrictAccess `
  -Description "FAVA Control Tecnico: solo puede enviar desde el buzon de avisos"
```

Y **comprobar las dos direcciones**, que es donde se ve si acota de verdad:

```powershell
# El buzón de avisos -> Granted
Test-ApplicationAccessPolicy -Identity techportal@favalatinoamerica.com -AppId <ENTRA_MAIL_CLIENT_ID>

# CUALQUIER otro buzón -> Denied. Si sale Granted, la política no está acotando nada.
Test-ApplicationAccessPolicy -Identity otra.persona@favalatinoamerica.com -AppId <ENTRA_MAIL_CLIENT_ID>
```

La política tarda **hasta una hora** en propagarse; hasta entonces `Test-` puede mentir.

### C.5 — Encender

Poner en los dos servicios de Railway (`app` y el cron):

```
ENTRA_MAIL_CLIENT_ID = <client id del registro C>
ENTRA_CLIENT_SECRET  = <el secreto de C.3>
NOTIF_FROM           = techportal@favalatinoamerica.com
APP_BASE_URL         = https://<dominio de la app>
NOTIF_TRANSPORT      = graph
```

**Cero cambios de código.** Hasta ese momento los avisos se encolan igual en la tabla
`notifications`, que es como se comprueba a quién se le habría escrito antes de
escribirle a nadie. El arranque exige las cuatro primeras si `NOTIF_TRANSPORT=graph`: si
falta una, el proceso muere al arrancar y no a las 16:01 del viernes.

---

## Fuentes

- [Configure an application to expose a web API](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-configure-app-expose-web-apis)
- [Register a single-page application](https://learn.microsoft.com/en-us/entra/identity-platform/scenario-spa-app-registration)
- [Access tokens in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens) — v1 vs v2, imposibilidad de validar tokens de Graph
- [MSAL Browser — redirect bridge](https://learn.microsoft.com/en-us/entra/msal/javascript/browser/redirect-bridge) — por qué el redirect URI es `/redirect.html`
