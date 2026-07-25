# Stack Research

**Domain:** Field-operations tracking web app (industrial machinery installation) — NestJS backend + existing React frontend, ~50 users, Railway hosting
**Researched:** 2026-07-25
**Confidence:** HIGH for versions (verified live against the npm registry + official docs); MEDIUM for the PDF and migration-tooling recommendations (judgement calls, rationale stated)

> Method note: Context7 MCP was not available in this session. Versions below were resolved by querying the **live npm registry** (`npm view <pkg> version`) on 2026-07-25 — this is authoritative and strictly better than training data. Behavioural claims were verified against official docs (Prisma, NestJS, Microsoft Learn, Railway). Anything I could not verify is marked LOW and flagged.

---

## Executive decision summary

Nine decisions, each with the one-line reason:

| # | Decision | Reason |
|---|----------|--------|
| 1 | **NestJS 11.1.x on Node 22 LTS, TypeScript 5.9.x** | TS 7 (Go compiler) is `latest` on npm but the NestJS CLI still pins TS 5.9.3 — decorators are the whole framework, do not gamble on it |
| 2 | **Prisma 7.9.x with `provider = "prisma-client"` + `moduleFormat = "cjs"` + `@prisma/adapter-pg`** | Prisma 7 is ESM-first and would fight NestJS's CJS/decorator setup; `moduleFormat = "cjs"` is an official escape hatch that removes the entire conflict |
| 3 | **`jose` v6 + a hand-written NestJS guard for Entra ID** | `passport-azure-ad` is **archived and formally deprecated** with no Microsoft replacement shipped; `jose.createRemoteJWKSet` does JWKS caching/rotation in one function and drops 5 packages |
| 4 | **Puppeteer 25.x rendering an HTML/CSS A4 template → PDF** | "Fiel al formato real" is the hard acceptance criterion; CSS `@page` + a table is the only approach where matching a paper form is a styling task, not a coordinate-math task |
| 5 | **One-off `.xls` migration outside the deployed backend** | The only Node lib that reads legacy BIFF (`xlsx`) is abandoned on npm at 0.18.5 with 2 unpatched high CVEs — do not ship it to production for a job that runs once |
| 6 | **ExcelJS 4.4.0 for *writing* .xlsx** (reconciliation report, Fase 2 exports) | Separate concern from reading .xls; writing is well covered and CVE-free |
| 7 | **Built-in `@Sse()` + `@microsoft/fetch-event-source` on the client** | SSE is native to NestJS (zero deps); the browser's `EventSource` **cannot send an `Authorization` header** — that is the one gotcha that sinks naive SSE + Entra ID |
| 8 | **Nivo 0.99.0, chart packages only** | Peer range is `^16.14 \|\| ^17 \|\| ^18 \|\| ^19` — works with the existing React 18.3.1 with **no frontend upgrade** |
| 9 | **Railway with Railpack (not Nixpacks) + `railway.toml` per service** | Railway put Nixpacks in maintenance mode and shipped Railpack as its replacement; but see the Puppeteer caveat — that one service wants a Dockerfile |

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **Node.js** | **22.x LTS** | Runtime | Forced by intersection of three constraints: Prisma 7 needs ≥20.19 (recommends 22), NestJS 11 needs ≥20, **Puppeteer 25.3.0 declares `engines.node: ">=22.12.0"`**. Node 22 is the only version that satisfies all three. Pin it (`.nvmrc` + `engines` in package.json + Railway `NODE_VERSION`). |
| **TypeScript** | **5.9.3** (pin exact) | Language | ⚠️ `npm view typescript version` returns **7.0.2** — TS 7 is the Go-native compiler and is now `latest` on npm. **Do not use it here.** `@nestjs/cli@11.0.24` still declares `typescript: 5.9.3` as its own dependency, and the tsgo team has never committed publicly to `experimentalDecorators` + `emitDecoratorMetadata` (the discussion asking for it sat unanswered). NestJS is *built* on emitted decorator metadata. Pin `"typescript": "5.9.3"` — no caret. |
| **NestJS** | **11.1.28** (`@nestjs/core`, `@nestjs/common`, `@nestjs/platform-express`) | Backend framework | Matches the decided stack. Peer deps confirmed: `reflect-metadata ^0.2`, `rxjs ^7.1`. Express platform (not Fastify) — Fastify buys throughput you do not need at ~50 users and complicates the SSE + Puppeteer paths. |
| **PostgreSQL** | **16 or 17** (Railway managed) | Database | Already decided. RLS + `set_config()` + JSONB (gastos/anticipos) + native aggregations for KPIs are all first-class. |
| **Prisma ORM** | **7.9.0** (`prisma` + `@prisma/client`) | Data access + migrations | See the dedicated section below — v7 is a **breaking** release and the config is non-obvious. |
| **@prisma/adapter-pg** | **7.9.0** (matches Prisma) | Postgres driver adapter | **Mandatory in Prisma 7.** The Rust query engine was removed; the client now talks to Postgres through an explicit driver adapter. Pulls in `pg` for you. |
| **React** | **18.3.1** (existing — leave alone) | Frontend | Nivo 0.99 supports React 18. No reason to touch it this milestone. |
| **Vite** | **5.4.x** (existing) | Frontend build | Leave alone. |

### Prisma 7 — the exact configuration (this is the part that goes wrong)

Prisma 7.9.0 is `latest`, and it is a **major breaking release**. The default upgrade path assumes an ESM project, which NestJS is not. Verified against Prisma's own generator reference and upgrade guide:

```prisma
// prisma/schema.prisma
generator client {
  provider     = "prisma-client"      // NOT "prisma-client-js" — that generator is legacy
  output       = "../src/generated/prisma"  // output is now REQUIRED, no more node_modules
  moduleFormat = "cjs"                // ← the line that makes Prisma 7 work with NestJS
  runtime      = "nodejs"
}
```

What changed in v7 and what it costs you:

| Change | Impact on this project |
|--------|------------------------|
| Rust query engine removed; **driver adapters mandatory** | Add `@prisma/adapter-pg`, construct `new PrismaPg({ connectionString })` and pass `{ adapter }` to `super()` in `PrismaService`. Upside: smaller image, less RAM — good on Railway. |
| **Ships as ESM by default** | Would break NestJS's CJS + `experimentalDecorators` build. Fixed entirely by `moduleFormat = "cjs"`. This option is documented in the official generator reference (values `"esm"` \| `"cjs"`, default inferred from environment) — **set it explicitly, do not rely on inference.** |
| **`output` is required**; client no longer in `node_modules` | Imports become `from '../generated/prisma'` (or a `@prisma` tsconfig path alias). Add `src/generated/` to `.gitignore` and `.dockerignore`. |
| **Post-install hook removed** | `prisma generate` must be an explicit step. Put it in `"build": "prisma generate && nest build"` — if you forget, Railway builds a container with no client. |
| **`$use` middleware removed** | The RLS `SET LOCAL` interceptor **must** be a `$extends` client extension, not middleware. |
| **`prisma.config.ts`** | Now the recommended home for CLI/datasource/seed config. Adopt it from day one rather than migrating later. |

⚠️ **RLS + Prisma caveat (MEDIUM confidence, verify early):** the standard client-extension RLS pattern wraps *every* query in a batch transaction running `SELECT set_config('app.current_user', $1, TRUE)` first. Prisma's own docs on that pattern warn it **can interfere with explicit `$transaction()` calls**. The weekly-note `submit`/`approve` transitions are exactly the multi-statement operations that need real interactive transactions. **Prototype this combination in the first backend phase**, not the last. Also: the app's DB role must be non-superuser and must not have `BYPASSRLS`, while migrations need a separate owner role — two Postgres roles, plan for it.

Pragmatic scoping: apply RLS **only** to the per-technician tables (`daily_entries`, `weekly_notes`, `trips`). Catalogs, projects and clients are readable by everyone authenticated — RLS policies on them are pure cost.

### Authentication — Microsoft Entra ID

**`passport-azure-ad` is dead. Verified directly:**

```
$ npm view passport-azure-ad deprecated
This package is deprecated and no longer supported.
```

The repository is **archived**. Microsoft's README points to a planned Node wrapper around `Microsoft.IdentityModel` that is *still internal-only* with no public release date. **There is no drop-in Microsoft-blessed replacement.** You validate the JWT yourself — which for a single-tenant API is genuinely small.

| Library | Version | Purpose | Why |
|---------|---------|---------|-----|
| **`jose`** | **6.2.4** | JWT verification + JWKS | **Recommended.** `createRemoteJWKSet(url)` handles fetch, `kid` selection, caching, rotation and rate-limit cooldown in one call; `jwtVerify(token, jwks, { issuer, audience })` does signature + `iss` + `aud` + `exp`/`nbf` in the same call. Zero dependencies, ships CJS+ESM, actively maintained. Replaces `jsonwebtoken` + `jwks-rsa` + `passport` + `@nestjs/passport` + `passport-jwt` with one import. |
| `@azure/msal-browser` | **5.17.1** | Frontend login | Official, current. |
| `@azure/msal-react` | **5.5.3** | React bindings for MSAL | Official React wrapper — `MsalProvider`, `useMsal`, `useAccount`. |

**The guard is roughly 30 lines.** It is not worth a Passport strategy plus four glue packages:

```ts
// common/auth/entra.guard.ts (sketch)
const JWKS = createRemoteJWKSet(new URL(
  `https://login.microsoftonline.com/${TENANT_ID}/discovery/v2.0/keys`));

const { payload } = await jwtVerify(token, JWKS, {
  issuer:   `https://login.microsoftonline.com/${TENANT_ID}/v2.0`,
  audience: API_CLIENT_ID,          // or api://<API_CLIENT_ID>
});
// then: payload.tid === TENANT_ID, and scp/roles contains the required scope
// then: look up local user by payload.oid → users.entra_oid
```

**Validation checklist, from Microsoft Learn (`entra/identity-platform/access-tokens`) — HIGH confidence:**

- [ ] **Signature** via `jwks_uri` from the **tenant-specific v2.0** metadata doc, selecting the key by the `kid` header claim. Single-tenant app → use the tenant-specific endpoint and require an **exact `iss` match**. (The `{tenantid}` template substitution and signing-key-issuer dance is only needed for *multitenant* apps — you are not one. Skip it.)
- [ ] **`aud`** must be your API's own App ID URI / client ID. The docs are explicit that accepting a token minted for another resource is the **confused-deputy** vulnerability.
- [ ] **`iss`** = `https://login.microsoftonline.com/{tenantId}/v2.0` for v2 tokens.
- [ ] **`tid`** matches the configured tenant.
- [ ] **`exp` / `nbf`** (handled by `jwtVerify`).
- [ ] **`scp`** (delegated) or **`roles`** (app-only) contains the required permission — this is *authorisation*, and it is a separate check from authentication.
- [ ] **`oid`** is the stable user key → matches `users.entra_oid` in the schema (§10 already has this — correct choice; `email`/`upn` are mutable, `oid` is not).

**Three gotchas that cost days if missed:**

1. **You must register a separate API app registration with an exposed scope** (e.g. `api://<api-client-id>/access_as_user`) and have the SPA request *that* scope. If the SPA requests only Graph scopes, you get a Graph token — and Microsoft states plainly that **tokens for Microsoft Graph cannot be validated** by you (proprietary format). This is the single most common Entra-with-SPA mistake.
2. Set **`requestedAccessTokenVersion: 2`** in the API app manifest so you get v2.0 tokens with a stable `ver` claim. v1 vs v2 tokens read metadata from *different* endpoints.
3. Token lifetime is randomised **60–90 minutes** (not a fixed hour). Frontend must handle silent renewal via MSAL; do not hardcode a 3600s assumption anywhere.

The "tenant dev → tenant FAVA by env var" requirement is satisfied cleanly: `ENTRA_TENANT_ID`, `ENTRA_API_CLIENT_ID`, `ENTRA_REQUIRED_SCOPE`. Nothing else is tenant-specific.

*Fallback if you want the textbook NestJS recipe instead:* `@nestjs/passport@11.0.5` + `passport@0.7.0` + `passport-jwt@4.0.1` + `jwks-rsa@4.1.0`. All current and non-deprecated, this is what most 2025/2026 tutorials show. It is more packages for the same result — take it only if the team strongly prefers the Passport idiom.

### PDF generation — the Nota de Prestación Semanal

The requirement is unusually strict: the output must be **accepted by FAVA's end clients as a replacement for a paper form** — header field grid (NIT, localidad, suministro, contrato, maquinaria, cargo semanal), a 7-row day table with a NOTA column, an expenses table, an anticipos line, a conformity declaration, and **two signature images plus a stamp**.

**Recommendation: Puppeteer 25.3.0 rendering an HTML/CSS template.** (MEDIUM-HIGH confidence — this is a judgement call, reasoning below.)

| Option | Version | Verdict |
|--------|---------|---------|
| **Puppeteer** ✅ | **25.3.0** | **Chosen.** With `@page { size: A4; margin: 15mm }` and a plain `<table>`, replicating a paper form is a *CSS* task. The canvas signature is literally `<img src="data:image/png;base64,…">`. Web fonts and accented ES/IT characters just work. Critically, the note is generated **at sign/approve time, a handful of times per week** — the "Chromium is heavy" objection is about high-throughput services, which this is not. |
| pdfmake | 0.3.11 | Strong runner-up, and the right call **if Railway image size or memory becomes a real problem**. Excellent table engine, ~2 MB, no browser. Cost: layout is a JSON DSL, so matching an exact paper form is iterative coordinate/width tuning instead of CSS. Note 0.3.x is a rewrite — most tutorials online are 0.2.x. |
| @react-pdf/renderer | 4.5.1 | Tempting ("the team knows React") but misleading: it is a **Yoga flexbox subset, not CSS**. No `<table>` — you rebuild tables from nested `<View>`s. Font registration is manual and easy to get wrong with accents. The React familiarity does not transfer to the layout model. |
| pdf-lib | 1.17.1 | Wrong tool for *generating* a layout. **Right tool if** you ever get the original Nota as a fillable PDF from FAVA — then you fill the AcroForm and stamp the signature PNGs onto a pixel-perfect original, which beats every other option. Worth 30 minutes asking FAVA whether such a file exists. |

**Deployment consequence (important for the roadmap):** Railway's Railpack builder will not reliably install Chromium's ~30 shared libraries. The PDF-generating service needs a **Dockerfile** (`node:22-bookworm-slim` + chromium deps, launch with `--no-sandbox --disable-dev-shm-usage`, and `--disable-dev-shm-usage` specifically because containers give `/dev/shm` only 64 MB). Railway publishes a working Puppeteer+TS template — start from it rather than assembling the apt list by hand. Reuse **one** browser instance across requests; do not `puppeteer.launch()` per PDF.

⚠️ **Terminology clarification for the roadmap:** "firma digital" in PROJECT.md means a **drawn canvas signature captured as a PNG** — an *electronic* signature, not a cryptographic one. Puppeteer/pdfmake/react-pdf all handle that. If FAVA ever asks for legally-binding non-repudiation (PAdES, certificate-based), that is a **different problem** requiring `@signpdf/signpdf` + a real X.509 certificate. Nothing in the current requirements asks for it. Flag it, do not build it.

### Excel — reading legacy `.xls` and writing `.xlsx`

These are two different problems with two different answers. Conflating them is a trap.

**Reading the legacy `.xls` (BIFF/OLE2) — do it OUTSIDE the deployed backend.**

The situation, verified: `xlsx` (SheetJS) is the only meaningful Node library that reads legacy BIFF. The **npm package is abandoned at 0.18.5** with two unpatched high-severity advisories (prototype pollution ≤0.19.2, ReDoS <0.20.2). SheetJS moved distribution to their own CDN (`cdn.sheetjs.com`), which means installing a **tarball URL in package.json** — outside npm audit, outside Dependabot, and something every future security scan will flag. `ExcelJS` **does not read `.xls` at all** (XLSX and CSV only), so it is not an escape route here.

**Recommendation:** the migration is a **one-shot ETL**. Do not make the production backend permanently depend on an abandoned, CVE-laden, non-npm-hosted parser for a job that runs once.

Pick either:
- **Python + `xlrd`** — CONTEXTO §17 records this **already working** on this exact file. Zero new risk, proven. Ship it as `tools/migration/`, not as a backend module. *(Preferred — it is the laziest option that is also the safest.)*
- **`soffice --headless --convert-to xlsx`** once, then parse the clean `.xlsx` with ExcelJS in a TypeScript script. Better if you want the migration logic in TS alongside the Prisma client (you get type-safe inserts and can reuse domain validators).

Either way the migration script lives in a `tools/` or `scripts/` workspace, is **not** part of the Railway deploy, and its output is the reconciliation report FAVA has to sign off on.

**Writing `.xlsx` (reconciliation report + Fase 2 matriz exports):**

| Library | Version | Notes |
|---------|---------|-------|
| **ExcelJS** ✅ | **4.4.0** | Recommended. Styling, merged cells, formulas, multiple sheets — everything the matriz format needs. ⚠️ Honest flag: **last published 2024-12-20** (~19 months stale). Stable and widely used, but not actively developed. Acceptable for write-only usage where the format is frozen. |
| `write-excel-file` | 4.1.1 | Alternative, **actively maintained** (published 2026-06-08). Smaller API surface, less styling power. Take it if ExcelJS's staleness is a blocker for your security review. |

### Real-time — SSE

**Server side: no dependency needed.** NestJS ships SSE natively (verified against the NestJS docs source):

```ts
@Sse('stream')
stream(): Observable<MessageEvent> { … }   // both from @nestjs/common
```

`MessageEvent` is `{ data: string | object; id?: string; type?: string; retry?: number }`. Client disconnect auto-unsubscribes from the Observable; use rxjs `finalize()` for teardown. Pair with `@nestjs/event-emitter@3.1.0` so domain modules emit events and the `realtime` module fans them out — that keeps `weekly-notes` from importing `realtime`.

**⚠️ Client side: the browser's native `EventSource` cannot set request headers.** There is no way to attach `Authorization: Bearer <entra-token>`. This is *the* thing that breaks SSE + token auth, and it will surface at exactly the wrong moment.

| Library | Version | Purpose |
|---------|---------|---------|
| **`@microsoft/fetch-event-source`** | **2.0.1** | **Recommended client.** `fetch`-based SSE, so you can send `Authorization` headers, use POST, and control retry/backoff. Actively maintained (published 2026-07-16). Ironically it is also a Microsoft package, so it sits naturally alongside MSAL. |

*Do not* work around this by putting the access token in a query string — it lands in proxy logs and Railway's request logs.

**Three more SSE gotchas:**
1. Exclude the SSE route from `compression` middleware — gzip buffering stalls the stream.
2. Emit a heartbeat comment (`:ping\n\n`) every ~20–30 s. Railway's edge proxy will drop idle connections.
3. Field technicians are on mobile with variable connectivity (PROJECT.md). SSE reconnects automatically, but design the payload as *"something changed, refetch"* rather than shipping state deltas — with React Query that is one `invalidateQueries` call and it is self-healing across reconnects.

### Charts — Nivo (replacing ECharts)

| Package | Version | Chart |
|---------|---------|-------|
| `@nivo/bar` | 0.99.0 | Vendido/ejecutado, días por cliente/país |
| `@nivo/line` | 0.99.0 | Utilización over time |
| `@nivo/pie` | 0.99.0 | Distribución por concepto |
| `@nivo/core` | 0.99.0 | Theming — see note |

**React compatibility, verified from the registry (HIGH):** `@nivo/core` and `@nivo/bar` both declare `peerDependencies: { react: "^16.14 || ^17.0 || ^18.0 || ^19.0" }`. The existing frontend's **React 18.3.1 is fully supported — no React upgrade is needed** for this milestone. React 19 also works if you upgrade later for other reasons.

Notes:
- `@nivo/core` is already a hard dependency of each chart package, so `npm i @nivo/bar @nivo/line @nivo/pie` is sufficient. Install `@nivo/core` explicitly anyway if you import the theme types directly.
- Animation is `@react-spring/web` (`9.4.5 || ^9.7.2 || ^10.0`) — pulled in transitively. If the app already has a spring version, check for a duplicate before debugging phantom animation bugs.
- Nivo's theming is a **JS object**, not classes — which is precisely why it was chosen over Tailwind-oriented libraries. Wire the existing light/dark toggle to one shared `nivoTheme` object; do not theme each chart.
- **Remove `echarts` from `package.json`** once the last chart is migrated. Leaving it is ~1 MB of dead bundle.

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@nestjs/config` | 4.0.4 | Env loading | Always. Pair with a zod schema so a missing `ENTRA_TENANT_ID` fails at boot, not at first login. |
| `zod` | 4.4.3 | Validation | Env schema + DTOs. CONTEXTO §12 already specifies zod. |
| `nestjs-zod` | 5.5.0 | Zod ↔ NestJS pipes/Swagger | Bridges zod DTOs into NestJS validation + OpenAPI. Peers confirmed: `@nestjs/common ^11`, `zod ^3.25 \|\| ^4`. **Use this instead of `class-validator`** — one validation library, not two. |
| `helmet` | 8.3.0 | Security headers | Always (§12). |
| `@nestjs/throttler` | 6.5.0 | Rate limiting | Always (§12). |
| `@nestjs/swagger` | 11.4.6 | OpenAPI | Generates the contract the frontend client is typed from — replaces hand-written API types. |
| `@nestjs/event-emitter` | 3.1.0 | In-process events | Decouples domain modules from the SSE module. |
| `nestjs-pino` + `pino` | 4.6.1 / 10.3.1 | Structured logging | Railway ingests JSON logs; `console.log` is unsearchable at scale. |
| `@nestjs/terminus` | 11.1.1 | Health checks | `/health` for Railway's healthcheck path — without it Railway cannot tell a booting app from a broken one. |
| `date-fns` | 4.4.0 | Dates | For the ES/IT week labels and week-boundary maths. **`date-fns@4` added first-class time-zone support** (`@date-fns/tz`) — relevant given "zonas horarias" is a named edge case. |
| `@tanstack/react-query` | 5.101.4 | Frontend server state | Frontend. Caching + `invalidateQueries` is what makes the SSE "refetch on change" pattern trivial. |

**Timezone stance (this is a data-model decision, not a library one):** `daily_entries.date` is a *calendar day*, not an instant. Store it as Postgres **`DATE`** (`@db.Date` in Prisma) and never as `timestamptz`. Technicians work across Colombia, Italy, Brazil, USA — the day a technician worked is a fact about their local calendar, and any `timestamptz` will eventually shift a day across a midnight boundary. Only `created_at`/`approved_at`/`signed_at` are true instants and should be `timestamptz`. Getting this wrong is a data-corruption bug that surfaces months later in the KPIs.

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| `@nestjs/cli` | 11.0.24 | Scaffolding + build | Bundles TS 5.9.3 — the version signal that decided the TypeScript pin. |
| `vitest` | 4.1.10 | Tests | Faster than Jest and already the Vite ecosystem default, so frontend and backend share one runner. If the team prefers zero friction, NestJS's default Jest setup is fine — this is not worth a debate. |
| `@faker-js/faker` | 10.5.0 | Seed data | Dev seeds for the 15 technicians / projects. |
| `docker-compose` | — | Local Postgres | Already in the §14 layout. Match the Railway Postgres major version exactly. |
| Prisma Studio | bundled | DB inspection | `npx prisma studio` — free admin UI during migration validation. |

---

## Installation

```bash
# ── backend/ ─────────────────────────────────────────────
# Core
npm install @nestjs/core@11 @nestjs/common@11 @nestjs/platform-express@11 \
            reflect-metadata rxjs

# Data
npm install @prisma/client@7 @prisma/adapter-pg@7 pg
npm install -D prisma@7

# Auth (NO passport-azure-ad — deprecated/archived)
npm install jose

# Config, validation, security, ops
npm install @nestjs/config zod nestjs-zod helmet @nestjs/throttler \
            @nestjs/swagger @nestjs/event-emitter @nestjs/terminus \
            nestjs-pino pino pino-http date-fns

# PDF + Excel export
npm install puppeteer exceljs

# Dev
npm install -D @nestjs/cli@11 typescript@5.9.3 @types/node@22 \
               @types/pg vitest @faker-js/faker

# ── frontend/ (additions only) ───────────────────────────
npm install @nivo/bar @nivo/line @nivo/pie @nivo/core
npm install @azure/msal-browser @azure/msal-react
npm install @microsoft/fetch-event-source @tanstack/react-query
npm uninstall echarts        # after the last chart is migrated

# ── tools/migration/ (NOT deployed) ──────────────────────
pip install xlrd            # proven on this exact .xls (CONTEXTO §17)
```

⚠️ Pin `typescript` **exactly** (`"typescript": "5.9.3"`, no `^`). A caret will not save you today, but `npm install` on a fresh machine after TS 6/7 becomes the default resolution target for `^5` ranges is a debugging session nobody wants.

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| Prisma 7 | **Drizzle ORM** | If the Prisma-7 + RLS + `$transaction` prototype turns painful. Drizzle is closer to SQL, makes `SET LOCAL` trivial, and has no codegen step. Cost: weaker migration tooling, no Prisma Studio, and it contradicts the already-decided stack. Only switch on evidence, in the first phase. |
| Prisma 7 | **Prisma 6.19.2** (`npm dist-tag prev`) | If v7's ESM/adapter/codegen changes eat more than a day. v6 is still tagged `prev` and supported. Fully legitimate fallback — but v7's `moduleFormat = "cjs"` should make it unnecessary. |
| Prisma 7 | **Kysely** for KPI queries | Recommended **alongside**, not instead. The vendido/ejecutado and utilización dashboards are multi-dimensional aggregations that Prisma's query API expresses badly. Prisma's `$queryRaw` (with `Prisma.sql` tagged templates) covers this with zero new deps — reach for Kysely only if raw SQL becomes unmaintainable. |
| `jose` + custom guard | `@nestjs/passport` + `passport-jwt` + `jwks-rsa` | If the team strongly prefers the documented NestJS Passport idiom, or you later add a second identity provider where Passport's strategy abstraction pays off. All packages current and non-deprecated. |
| Puppeteer | **pdfmake 0.3.11** | If the Railway image size / memory cost of Chromium becomes a real constraint, or if the deployment must stay on Railpack with no Dockerfile. |
| Puppeteer | **pdf-lib 1.17.1** | **If FAVA can supply the original Nota as a fillable PDF.** Then filling the AcroForm and stamping signature PNGs is both easier *and* more faithful than any renderer. Worth one email to find out before building a template. |
| Puppeteer | Playwright 1.62.0 | Equivalent PDF output, better if you also want browser E2E tests and would rather install one browser stack than two. |
| ExcelJS (write) | `write-excel-file` 4.1.1 | If ExcelJS's 19-month publish gap fails a security review. |
| Python `xlrd` (read) | SheetJS from `cdn.sheetjs.com` | If the whole migration must be TypeScript. Accept the tarball-URL dependency **in `tools/` only** — never in the deployed backend. |
| Railway | Azure App Service + Azure DB for Postgres | CONTEXTO §12 assumes Azure (Key Vault, VNet, TDE). Railway was chosen later for speed. If FAVA's IT mandates Azure-only hosting for the production tenant, that is a **hosting migration**, and the §12 security controls map to Azure natively. Keep secrets in env vars only, so the swap is configuration, not code. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **`passport-azure-ad`** | **Archived and formally deprecated** (`npm view` returns the deprecation notice). Repo read-only. Microsoft's stated replacement is an internal-only wrapper with no public release. Still the top Google result — the team will find it and try it. | `jose@6.2.4` + a NestJS guard, or `passport-jwt` + `jwks-rsa` |
| **TypeScript 7.x** | It is `latest` on npm (7.0.2), so a naive `npm i -D typescript` installs it. The tsgo compiler has never publicly committed to `experimentalDecorators` + `emitDecoratorMetadata`; the NestJS CLI still ships TS 5.9.3. NestJS without decorator metadata does not boot. | `typescript@5.9.3`, pinned exactly |
| **`xlsx@0.18.5` from npm** | Abandoned. Two unpatched high-severity advisories (prototype pollution ≤0.19.2, ReDoS <0.20.2). No fixed version exists on npm at all. | Python `xlrd` for the one-off read; ExcelJS for writing |
| **`prisma-client-js` generator** | Legacy generator in Prisma 7. Generating into `node_modules` and the post-install hook are both gone. Every pre-2026 tutorial shows it. | `provider = "prisma-client"` with explicit `output` + `moduleFormat` |
| **Prisma `$use` middleware** | **Removed in v7.** The most-copied RLS-with-Prisma snippet online uses it. | `$extends` client extension with a query interceptor |
| **Nixpacks** | Railway put it in **maintenance mode** and shipped **Railpack** as its replacement. New Nixpacks features are not coming. | Railpack (Railway's default), or a Dockerfile for the Puppeteer service |
| **Browser-native `EventSource`** for the authed stream | Cannot send an `Authorization` header — full stop. Leads people to put tokens in query strings, which then land in proxy/Railway logs. | `@microsoft/fetch-event-source@2.0.1` |
| **`class-validator` + `class-transformer`** | Duplicates zod, which §12 already mandates. Two validation systems means two places every rule can drift. | `zod@4` + `nestjs-zod@5` |
| **WebSockets / Socket.IO** | Explicitly out of scope (PROJECT.md). Adds sticky sessions, a second protocol and reconnection logic for ~50 users. | Built-in `@Sse()` |
| **Fastify platform** | Buys throughput you do not need and complicates SSE and streaming-response handling. | `@nestjs/platform-express` |
| **S3/R2/Azure Blob + signed URLs (for now)** | §12 says "PDFs in private storage with signed URLs", but at a few hundred PDFs/year that is a whole extra service, SDK, credential and failure mode. `GET /api/weekly-notes/:id/pdf` is already in the endpoint design **and already role-guarded** — that *is* private storage with authorisation. | Store PDF bytes on a Railway volume (or Postgres `bytea`) and serve them through the existing guarded endpoint. Graduate to R2/Azure Blob when volume, CDN, or direct client links actually demand it. |

---

## Railway Deployment

Verified against Railway's docs (monorepo, build configuration) and the Railpack announcement.

**Services:** three, one Railway project.

| Service | Root Directory | Builder | Notes |
|---------|---------------|---------|-------|
| `backend` | `/fava-control-tecnico/backend` | **Dockerfile** | Needs Chromium for Puppeteer — Railpack will not install the shared libs. Start from Railway's Puppeteer+TS template Dockerfile. |
| `frontend` | `/fava-control-tecnico/frontend` | Railpack | Static Vite build. |
| `Postgres` | — | Railway managed | Provides `PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE`. |

**Specifics that matter:**

- **Root Directory** per service (isolated-monorepo pattern) so a frontend commit does not rebuild the backend. Railway auto-detects JS monorepos (npm/pnpm/yarn/bun) on import and pre-stages services.
- **Watch paths** per service (`/fava-control-tecnico/backend/**`) — same reason, belt and braces.
- ⚠️ **`railway.toml` does not follow the Root Directory setting** — it needs an **absolute repo path** (`/fava-control-tecnico/backend/railway.toml`). This is a documented footgun.
- **`DATABASE_URL`** via reference variable: `DATABASE_URL=${{Postgres.DATABASE_URL}}` (or compose it from the `PG*` refs). Never hardcode.
- **Bind `0.0.0.0` and `process.env.PORT`.** `app.listen(port, '0.0.0.0')` — NestJS's default localhost bind means Railway's proxy cannot reach the container and the deploy fails a healthcheck with no useful error. This is the #1 first-deploy failure.
- **Migrations:** `prisma migrate deploy` in the **pre-deploy command**, not in the build and not at app boot. Boot-time migration means N replicas racing the same migration.
- **Build command must include `prisma generate`** — the post-install hook is gone in v7.
- **Healthcheck path** `/health` (via `@nestjs/terminus`).
- ⚠️ **Railway blocks outbound SMTP** (PROJECT.md constraint, and confirmed by prior projects in this workspace). If notifications are ever added, use an HTTP API — Resend or Microsoft Graph `sendMail` (the latter is arguably better here since the tenant is already Microsoft 365 and needs no new vendor).

---

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `@nestjs/core@11.1.28` | `@nestjs/common@11`, `platform-express@11`, `reflect-metadata ^0.2`, `rxjs ^7.1` | Peer deps read from the registry. Keep all `@nestjs/*` on the same major. |
| `@nestjs/cli@11.0.24` | `typescript 5.9.3` | The CLI's own dependency — the reason for the TS pin. |
| `prisma@7.9.0` | `@prisma/client@7.9.0`, `@prisma/adapter-pg@7.9.0` | Keep all three **exactly** in lockstep. Version drift between client and adapter produces confusing runtime errors. |
| `prisma@7` | Node **≥ 20.19.0**, 22.x recommended | Official upgrade guide. |
| `puppeteer@25.3.0` | Node **≥ 22.12.0** | Declared in `engines`. **This is the binding constraint — it is why the answer is Node 22, not Node 20.** |
| `@nivo/*@0.99.0` | React `^16.14 \|\| ^17 \|\| ^18 \|\| ^19` | Existing React 18.3.1 works as-is. All `@nivo/*` packages must share the same 0.99.0 version. |
| `nestjs-zod@5.5.0` | `@nestjs/common ^11`, `@nestjs/swagger ^11`, `zod ^3.25 \|\| ^4` | Compatible with `zod@4.4.3`. |
| `@nestjs/passport@11.0.5` | `passport ^0.5 \|\| ^0.6 \|\| ^0.7` | Only if you take the Passport fallback. |
| `@azure/msal-react@5.5.3` | `@azure/msal-browser@5.17.1` | Keep on the same major. |

---

## Confidence Assessment

| Recommendation | Confidence | Basis |
|----------------|------------|-------|
| All version numbers | **HIGH** | Queried live against the npm registry on 2026-07-25 |
| `passport-azure-ad` is deprecated | **HIGH** | `npm view passport-azure-ad deprecated` returns the notice; repo archived |
| Entra token validation rules | **HIGH** | Microsoft Learn `entra/identity-platform/access-tokens` (doc updated 2026-07-17) |
| Prisma 7 breaking changes + `moduleFormat = "cjs"` | **HIGH** | Official Prisma generator reference and v7 upgrade guide |
| NestJS `@Sse()` API | **HIGH** | Read from the NestJS docs repo source |
| Nivo React peer range | **HIGH** | `peerDependencies` read directly from the registry |
| TS 7 lacks usable decorator-metadata support | **MEDIUM** | Strongly implied: `@nestjs/cli` still ships 5.9.3, and the tsgo decorators discussion has no official answer. Could not find a definitive "not supported" statement — treat the pin as cheap insurance, not proven necessity. |
| Puppeteer over pdfmake | **MEDIUM** | Judgement call weighted by the "fiel al formato real" acceptance criterion and low generation volume. Both work; this one gets there faster. |
| Prisma RLS extension conflicts with `$transaction()` | **MEDIUM** | Warned about in Prisma's own client-extensions docs. **Flagged for early prototyping.** |
| Railway Railpack vs Dockerfile for Puppeteer | **MEDIUM** | Railpack's FAQ states it will not support Dockerfiles in combination; Railway does publish a Puppeteer Dockerfile template. Not tested end-to-end here. |
| ExcelJS staleness is acceptable | **MEDIUM** | Last publish 2024-12-20, verified. No known unpatched CVEs found, but I did not audit exhaustively. |

## Open Questions for the Roadmap

1. **Does FAVA have the Nota as a fillable PDF?** If yes, `pdf-lib` beats every renderer on both effort and fidelity. One email answers it — ask before building an HTML template.
2. **Prisma 7 + RLS + interactive `$transaction()`** — spike this in the first backend phase. It is the one place where the chosen stack has a documented internal tension, and finding out during the weekly-note approval flow would be expensive.
3. **Will FAVA's IT mandate Azure hosting?** CONTEXTO §12 assumes Azure (Key Vault, VNet, TDE); Railway was a later decision. Keep every secret in env vars so the answer stays a configuration change.
4. **Is `soffice` available on the migration machine?** Decides between the two `.xls` reading paths. Python `xlrd` is already proven, so this is only relevant if the team wants the migration in TypeScript.

---

## Sources

- **npm registry** (live query, 2026-07-25) — all version numbers, peer dependencies, `engines`, deprecation flags, publish dates. HIGH.
- [Microsoft Learn — Access tokens in the Microsoft identity platform](https://learn.microsoft.com/en-us/entra/identity-platform/access-tokens) — validation rules, v1/v2 metadata endpoints, issuer/audience/confused-deputy guidance, token lifetime. HIGH.
- [AzureAD/passport-azure-ad (archived)](https://github.com/AzureAD/passport-azure-ad) — deprecation notice and replacement status. HIGH.
- [Prisma — Upgrade to Prisma ORM 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7) — breaking changes, driver adapters, `$use` removal, Node ≥20.19. HIGH.
- [Prisma — Schema generators reference](https://www.prisma.io/docs/orm/prisma-schema/overview/generators) — `moduleFormat` (`esm`/`cjs`), `runtime`, `output`. HIGH.
- [Prisma — NestJS guide](https://www.prisma.io/docs/guides/frameworks/nestjs) — `PrismaService` + `PrismaPg` adapter pattern. HIGH.
- [prisma/prisma-client-extensions — row-level-security](https://github.com/prisma/prisma-client-extensions/tree/main/row-level-security) + [Client extensions docs](https://www.prisma.io/docs/orm/prisma-client/client-extensions) — `set_config` pattern and the `$transaction` caveat. MEDIUM.
- [NestJS docs source — Server-Sent Events](https://raw.githubusercontent.com/nestjs/docs.nestjs.com/master/content/techniques/server-sent-events.md) — `@Sse()`, `MessageEvent`, disconnect semantics. HIGH.
- [Railway — Monorepo guide](https://docs.railway.com/guides/monorepo) — root directory, watch paths, absolute `railway.toml` path. HIGH.
- [Railway — Deploy a NestJS App](https://docs.railway.com/guides/nest) + [Build configuration](https://docs.railway.com/builds/build-configuration) — service variable references, builders. HIGH.
- [Railway — Why We're Moving on From Nix (Railpack)](https://blog.railway.com/p/introducing-railpack) + [Railpack FAQ](https://railpack.com/faq/) — Nixpacks maintenance mode, no Dockerfile combination. MEDIUM.
- [SheetJS issue #2934 / #3098](https://git.sheetjs.com/sheetjs/sheetjs/issues/2934) + [GitLab advisories for npm/xlsx](https://advisories.gitlab.com/pkg/npm/xlsx/) — 0.18.5 CVEs, CDN-only distribution. HIGH.
- [Nutrient — Top JavaScript PDF generator libraries for 2026](https://www.nutrient.io/blog/top-js-pdf-libraries/) + [Joyfill — PDF generation in Node.js backends](https://joyfill.io/blog/integrating-pdf-generation-into-node-js-backends-tips-gotchas) — Puppeteer vs pdfmake vs react-pdf tradeoffs. MEDIUM (WebSearch, multiple sources agree).
- [nivo GitHub — React 19 Support #2618](https://github.com/plouc/nivo/issues/2618) — corroborates the registry peer range. MEDIUM.
- [Andrew Connell — Validating Entra ID generated OAuth tokens](https://www.andrewconnell.com/articles/entra-id-validating-generated-oauth-tokens/) — practical Node validation walkthrough. MEDIUM.
- `CONTEXTO-PROYECTO-FAVA.md` §9–§14, `.planning/PROJECT.md` — project constraints and prior decisions. HIGH.

---
*Stack research for: field-operations tracking web app — NestJS backend + integration milestone*
*Researched: 2026-07-25*
