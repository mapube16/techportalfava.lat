# Variables de entorno

**Regla dura del proyecto: ninguna variable existe SOLO en el dashboard de Railway.**
Toda variable que la aplicación necesite está listada aquí, con su origen y su
sensibilidad. Si mañana hay que recrear el proyecto en otra cuenta de Railway o en
otro tenant de Entra, esta tabla más [ENTRA-SETUP.md](./ENTRA-SETUP.md) y
`backend/scripts/db-bootstrap.ts` son suficientes. Añadir una variable al dashboard
sin añadirla aquí es dejar una mina para el que la recree.

Plantillas listas para copiar: `backend/.env.example` y `frontend/.env.example`.
Los `.env` reales están en `.gitignore` y **nunca** se commitean.

---

## Backend — `fava-control-tecnico/backend/.env`

Las variables que valida `src/config/env.ts` con zod. Si falta una que no tenga
default, **el proceso no arranca** (a propósito: mejor un fallo en el boot que un
fallo intermitente en producción).

| Variable | Secreta | Default | Origen |
|---|:---:|---|---|
| `DATABASE_URL` | 🔴 sí | — | Conexión de **runtime**, con el rol `fava_app`. Local: el Postgres del `docker-compose.yml`. Railway: se construye a mano con el host/puerto/db del servicio Postgres, usuario `fava_app` y `APP_DB_PASSWORD` |
| `MIGRATE_DATABASE_URL` | 🔴 sí | — | Conexión de **owner** (usuario `postgres`), sólo para bootstrap, migraciones y seed. Railway: referencia `${{Postgres.DATABASE_URL}}` |
| `APP_DB_PASSWORD` | 🔴 sí | — | Contraseña que `db-bootstrap` asigna al rol `fava_app`. La eliges tú; en Railway, generada aleatoria |
| `ENTRA_TENANT_ID` | no | — | Entra → Overview → *Directory (tenant) ID* ([ENTRA-SETUP](./ENTRA-SETUP.md#a2-copiar-los-dos-primeros-valores)) |
| `ENTRA_API_CLIENT_ID` | no | — | Registro **A** (API) → *Application (client) ID*. Es el `aud` que valida el guard |
| `ENTRA_REQUIRED_SCOPE` | no | `access_as_user` | Nombre del scope expuesto por el Registro A. Sólo cambia si se renombra el scope |
| `SEED_SUPERADMIN_EMAIL` | no | — | Email de la cuenta que el seed crea como Super Admin (T+A+S). En dev, tu cuenta del tenant; en FAVA, el email corporativo del primer admin |
| `PORT` | no | `3000` | Railway lo inyecta solo. En local no hace falta tocarlo |
| `DEV_AUTH_ENABLED` | no | `false` | **Temporal.** `true` enciende el login de desarrollo. Solo acepta `true` o `false`: cualquier otro valor no arranca. Ver [§ Login de desarrollo temporal](#login-de-desarrollo-temporal) |
| `DEV_AUTH_PASSWORD` | 🔴 sí | — | Contraseña compartida de ese login. Obligatoria y de **12 caracteres o más** si el flag está encendido; sin ella el proceso no arranca. No existe valor por defecto |

**Por qué dos URLs de base de datos.** El rol que Railway entrega
(`postgres`) es superusuario y dueño de las tablas: **salta RLS sin dejar ningún
síntoma**. Si el runtime corre con esa URL, las políticas de aislamiento quedan
escritas y sin efecto, y ningún test lo nota. El runtime conecta siempre como
`fava_app` (`NOBYPASSRLS`, no dueño, sin DDL). Ver `db-bootstrap.ts`.

**No poner parámetros de pool en la URL.** En Prisma 7 `?connection_limit=N` se
**ignora en silencio**; el pool se configura en el adapter `PrismaPg`
(`max`, `connectionTimeoutMillis`) dentro de `prisma.service.ts`.

---

## Frontend — `fava-control-tecnico/frontend/.env`

Vite sólo expone al bundle las variables con prefijo `VITE_`, y las **hornea en
tiempo de build**: cambiarlas exige reconstruir el frontend, no basta con
reiniciar el servicio.

| Variable | Secreta | Origen |
|---|:---:|---|
| `VITE_ENTRA_TENANT_ID` | no | El mismo valor que `ENTRA_TENANT_ID`. Copia separada porque el frontend no ve las variables sin prefijo |
| `VITE_ENTRA_SPA_CLIENT_ID` | no | Registro **B** (SPA) → *Application (client) ID* |
| `VITE_API_SCOPE` | no | Registro A → Expose an API → `api://<api-client-id>/access_as_user` |
| `VITE_DEV_AUTH` | no | **Temporal.** `true` pinta el formulario de acceso de desarrollo y el aviso permanente. Va siempre a la par de `DEV_AUTH_ENABLED`; sola no sirve de nada (el backend responde 404) |

⚠️ **Nada secreto puede vivir en una `VITE_*`**: acaba en texto plano dentro del
JS que descarga el navegador. Los tres valores de arriba son identificadores
públicos por diseño (un client id de SPA no es una credencial: el flujo es PKCE
sin secreto). Cualquier clave, contraseña o token de servicio va en el backend.

La URL del API no es variable: el backend sirve el frontend desde el mismo
origen, así que las llamadas son a rutas relativas `/api/...`. Sin CORS, sin
preflight, sin `VITE_API_URL`.

---

## Login de desarrollo temporal

**Existe solo mientras FAVA no tenga su tenant de Entra**, y hay que retirarlo el
día que lo tenga. Permite entrar en la app desplegada con email + una contraseña
compartida en vez de con Microsoft.

**Lo que no es: un bypass.** `POST /api/dev-auth/login` no autoriza nada: emite un
JWT RS256 firmado con un par de claves que el proceso genera **en memoria** al
arrancar, y ese token recorre después el mismo `EntraGuard` que un token real —
firma, issuer, audiencia, expiración, `tid`, scope y consulta del usuario en la
base **en cada petición**. El guard no tiene ni una rama para este modo: lo único
que cambia es qué keyset lo verifica (`src/common/auth/jwks.provider.ts`). Un
usuario que no exista, o que esté desactivado, no entra ni con la contraseña
correcta, y los roles siguen saliendo de la base de datos.

### Encenderlo

Las tres variables **a la vez**; las `VITE_*` se hornean en el build, así que hay
que **redesplegar**, no basta con reiniciar:

| Variable | Valor |
|---|---|
| `DEV_AUTH_ENABLED` | `true` |
| `DEV_AUTH_PASSWORD` | Contraseña **generada al azar**, 12 caracteres mínimo (el arranque lo exige). Nunca una frase común: es lo único que separa a internet de la app |
| `VITE_DEV_AUTH` | `true` |

Con el modo encendido es imposible no verlo: el arranque escribe un log en nivel
`warn` diciéndolo, y la interfaz lleva una banda naranja permanente en todas las
pantallas. Si la app está asegurada por Microsoft, esa banda no aparece.

### Apagarlo — obligatorio al llegar el tenant real

1. **Quitar las tres variables** del servicio `app` y redesplegar. La ruta deja de
   existir (responde **404**, no 401) y el keyset local ni se carga: los tokens
   de desarrollo que hubiera sueltos dejan de valer en el acto.
2. **Limpiar los OID de desarrollo**, con la conexión de owner
   (`MIGRATE_DATABASE_URL`):
   ```sql
   UPDATE users SET entra_oid = NULL WHERE entra_oid LIKE 'dev:%';
   ```
   **Este paso no es opcional.** Sin tenant, el usuario no tiene OID de Microsoft,
   así que el primer login de desarrollo vincula uno ficticio con prefijo `dev:`
   (la misma vinculación que hace un primer login real). Si esa fila se queda con
   el OID ficticio, el login real de esa persona **no encuentra su cuenta y no
   puede vincularla** — el usuario ve «tu cuenta no está habilitada» y en los logs
   no hay ningún error. Es un fallo silencioso, y se arregla con esta línea.
3. Comprobar que no quedó rastro:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<dominio>/api/dev-auth/login   # 404
   ```

### Límites conocidos (mientras esté encendido)

- **La contraseña es compartida: quien la tenga puede entrar como cualquier email
  dado de alta**, incluido el Super Admin. La identidad la declara quien inicia
  sesión; no hay segundo factor ni trazabilidad individual. Por eso el modo es
  temporal y por eso la app no debe llevar datos reales mientras dure.
- **30 intentos por hora** en el endpoint. Detrás del proxy de Railway todas las
  peticiones llegan con la misma IP, así que ese límite es de hecho global para
  todo el equipo.
- El token dura **8 horas** y las claves viven en memoria: cada redespliegue o
  reinicio cierra todas las sesiones abiertas.
- El botón de Microsoft sigue en la pantalla, pero **no funciona con este modo
  encendido**: el keyset local sustituye al de Microsoft, no se suma.

---

## Dónde vive cada valor

| Entorno | Backend | Frontend |
|---|---|---|
| Local | `backend/.env` (gitignored) | `frontend/.env` (gitignored) |
| Railway | Variables del servicio (`railway variables`) | Las mismas: son build-time, se leen al construir |

Las secretas (🔴) **sólo** existen en el `.env` local de cada desarrollador y en el
dashboard de Railway. Nunca en el repo, nunca en un chat, nunca en un log
(el logger redacta la cabecera `authorization`).

---

## Railway — variables del servicio `app`

> ## ⛔ La que hay que hacer bien: `DATABASE_URL`
>
> Railway autogenera una `DATABASE_URL` en el servicio Postgres. Esa URL es del
> usuario **`postgres`**: superusuario y dueño de las tablas. Un superusuario
> **se salta RLS incluso con `FORCE ROW LEVEL SECURITY`**, y lo hace **sin
> ningún síntoma**: la app funciona, los tests pasan, los logs están limpios, y
> cada técnico ve los datos de todos.
>
> **Referenciar `${{Postgres.DATABASE_URL}}` en la variable `DATABASE_URL` del
> servicio `app` desactiva silenciosamente todo el aislamiento del producto.**
>
> Esa referencia va **sólo** en `MIGRATE_DATABASE_URL`, que únicamente usa el
> pre-deploy. El runtime conecta como `fava_app`, y su URL se escribe a mano.
>
> Comprobación después del primer deploy — debe devolver `fava_app / f / f`:
> ```sql
> SELECT current_user, rolsuper, rolbypassrls FROM pg_roles WHERE rolname = current_user;
> ```

Todas se cargan en el servicio `app` (no en el de Postgres), desde el dashboard o
con `railway variables --set 'NOMBRE=valor'`. Railway las inyecta **también en el
build**, que es cuando Vite hornea las `VITE_*`.

| Variable | Valor en Railway |
|---|---|
| `MIGRATE_DATABASE_URL` | `${{Postgres.DATABASE_URL}}` — referencia de Railway (red privada, usuario owner). La lee el pre-deploy y nadie más |
| `DATABASE_URL` | **A mano**: `postgresql://fava_app:${{APP_DB_PASSWORD}}@${{Postgres.RAILWAY_PRIVATE_DOMAIN}}:5432/${{Postgres.PGDATABASE}}?schema=public` — ver el aviso de arriba |
| `APP_DB_PASSWORD` | Contraseña aleatoria que se le dio a `fava_app` en el bootstrap (paso 3). Debe coincidir con la de `DATABASE_URL` |
| `ENTRA_TENANT_ID` | Directory (tenant) ID del tenant dev |
| `ENTRA_API_CLIENT_ID` | Client ID del Registro **A** (API) |
| `ENTRA_REQUIRED_SCOPE` | `access_as_user` |
| `SEED_SUPERADMIN_EMAIL` | Email de la cuenta del tenant que será Super Admin |
| `VITE_ENTRA_TENANT_ID` | Mismo valor que `ENTRA_TENANT_ID` |
| `VITE_ENTRA_SPA_CLIENT_ID` | Client ID del Registro **B** (SPA) |
| `VITE_API_SCOPE` | `api://<ENTRA_API_CLIENT_ID>/access_as_user` |
| `DEV_AUTH_ENABLED` · `DEV_AUTH_PASSWORD` · `VITE_DEV_AUTH` | **Solo mientras no exista el tenant de FAVA** — ver [§ Login de desarrollo temporal](#login-de-desarrollo-temporal). Retirarlas es el primer paso del cutover |

`PORT` **no se pone**: Railway la inyecta sola.

Las tres `VITE_*` se hornean en el bundle: cambiarlas exige **redesplegar**, no
basta con reiniciar el servicio.

### Configuración del servicio (dashboard)

| Ajuste | Valor | Por qué |
|---|---|---|
| Root Directory | `/fava-control-tecnico` | El repo tiene la documentación del proyecto fuera de la app |
| Config-as-code | `/fava-control-tecnico/railway.toml` | **Ruta absoluta desde la raíz del repo**: el archivo de configuración *no* sigue el Root Directory. Con la ruta relativa Railway no lo encuentra y no avisa |

Todo lo demás (build, start, healthcheck, pre-deploy, réplicas) vive en
`railway.toml`, no en el dashboard.

### Primer deploy en una cuenta Railway nueva

Orden obligatorio; los pasos 1–4 se corren **desde local**, antes de que exista
un deploy que funcione:

1. `railway login` → `railway init` → `railway add --database postgres` → `railway link`.
2. Copiar del servicio Postgres la variable **`DATABASE_PUBLIC_URL`**
   (`*.proxy.rlwy.net`). La privada (`*.railway.internal`) **no es alcanzable
   desde fuera de Railway**: contra ella, el bootstrap se cuelga.
3. Bootstrap del rol y esquema, con esa URL pública:
   ```bash
   cd fava-control-tecnico
   MIGRATE_DATABASE_URL='<DATABASE_PUBLIC_URL>' APP_DB_PASSWORD='<pw generada>' \
     npm -w backend run db:bootstrap    # crea fava_app NOBYPASSRLS + default privileges
   MIGRATE_DATABASE_URL='<DATABASE_PUBLIC_URL>' npm -w backend run db:migrate
   MIGRATE_DATABASE_URL='<DATABASE_PUBLIC_URL>' SEED_SUPERADMIN_EMAIL='<email>' \
     npm -w backend run db:seed
   ```
   El bootstrap **antes** de la primera migración no es negociable: las
   migraciones hacen `GRANT` a `fava_app`, que tiene que existir ya.
4. Cargar las variables de la tabla de arriba en el servicio `app`.
5. Ajustar Root Directory y Config-as-code (tabla anterior) y desplegar
   (`railway up` o conectando el repo de GitHub).
6. En los logs del deploy, verificar dos cosas: la versión de Node (**≥ 22.12**,
   o `jose` no carga) y que el healthcheck pasó.
7. Añadir en Entra el redirect URI de producción: Registro B (SPA) →
   Authentication → `https://<dominio>.up.railway.app/redirect.html`.
8. Smoke: `npm -w backend run smoke -- https://<dominio>.up.railway.app` → 4/4.

La major de Postgres que provisiona Railway debe coincidir con la del
`docker-compose.yml` (17). Si difiere, se alinea el compose: un desajuste de
major cambia defaults de permisos y comportamiento de RLS entre local y
producción.

---

## Primer arranque en una cuenta nueva

Versión genérica; para Railway, la secuencia concreta está en
[§ Primer deploy en una cuenta Railway nueva](#primer-deploy-en-una-cuenta-railway-nueva).
Orden obligatorio — cada paso depende del anterior:

1. **Entra:** seguir [ENTRA-SETUP.md](./ENTRA-SETUP.md) → obtener los 4 valores.
2. **Postgres:** crear la base (local con `docker compose up -d db`; en Railway,
   añadiendo el servicio Postgres).
3. **Bootstrap del rol:** `npm -w backend run db:bootstrap` con
   `MIGRATE_DATABASE_URL` (owner) y `APP_DB_PASSWORD` en el entorno. Es
   idempotente: correrlo N veces deja el mismo estado. Contra Railway se corre
   desde local con la URL **pública** del Postgres (la privada
   `*.railway.internal` no es alcanzable desde fuera).
4. **Migraciones y seed:** `prisma migrate deploy` y `prisma db seed`, también con
   `MIGRATE_DATABASE_URL`.
5. **Variables:** cargar la lista completa de este documento en el `.env` local o
   en el servicio de Railway.
6. **Deploy / arranque.** Si falta una variable, el boot falla con el nombre de la
   que falta — eso es la validación zod haciendo su trabajo.

El paso 3 antes del 4 no es negociable: el `GRANT` de las migraciones referencia
al rol `fava_app`, que tiene que existir antes (incluido en la shadow database
de `prisma migrate dev`, por eso el bootstrap se corre también en local).
