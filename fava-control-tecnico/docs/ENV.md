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

Las 8 variables que valida `src/config/env.ts` con zod. Si falta una que no tenga
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

⚠️ **Nada secreto puede vivir en una `VITE_*`**: acaba en texto plano dentro del
JS que descarga el navegador. Los tres valores de arriba son identificadores
públicos por diseño (un client id de SPA no es una credencial: el flujo es PKCE
sin secreto). Cualquier clave, contraseña o token de servicio va en el backend.

La URL del API no es variable: el backend sirve el frontend desde el mismo
origen, así que las llamadas son a rutas relativas `/api/...`. Sin CORS, sin
preflight, sin `VITE_API_URL`.

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

## Primer arranque en una cuenta nueva

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
